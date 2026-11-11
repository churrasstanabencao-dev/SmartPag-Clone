import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, PackageSearch, ShoppingCart, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId, useStore } from "@/lib/store";
import { brl } from "@/lib/format";
import { SectionTitle, IconTile } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const WINDOW_DAYS = 30;

type Suggestion = {
  id: string;
  name: string;
  sku: string | null;
  categoryId: string | null;
  categoryName: string;
  stock: number;
  minStock: number;
  sold: number;
  avgDaily: number;
  coverDays: number;
  suggested: number;
  unitCents: number;
};

export function ComprasMatrizModule() {
  const qc = useQueryClient();
  const { matriz, store } = useStore();
  const storeId = currentStoreId();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [target, setTarget] = useState("15");
  const [onlyNeeded, setOnlyNeeded] = useState(true);
  const [qty, setQty] = useState<Record<string, string>>({});

  const since = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - WINDOW_DAYS);
    return d.toISOString();
  }, []);

  const { data: products = [] } = useQuery({
    queryKey: ["cm", "products", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, category_id, stock_qty, min_stock, cost_cents, active")
        .eq("store_id", storeId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["cm", "categories", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .eq("store_id", storeId)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: sales = [] } = useQuery({
    queryKey: ["cm", "sales", storeId, since],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("product_id, quantity, reason, created_at")
        .eq("store_id", storeId)
        .gte("created_at", since)
        .limit(5000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: matrizProducts = [] } = useQuery({
    queryKey: ["cm", "matriz-products", matriz?.id],
    enabled: !!matriz?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, wholesale_price_cents, cost_cents, stock_qty")
        .eq("store_id", matriz!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const targetDays = Math.max(1, Number(target.replace(",", ".")) || 15);

  const rows: Suggestion[] = useMemo(() => {
    const soldByProduct = new Map<string, number>();
    sales.forEach((m) => {
      if (m.reason !== "venda" && m.reason !== "uso_cozinha" && m.reason !== "perda") return;
      const q = Math.abs(Number(m.quantity));
      soldByProduct.set(m.product_id, (soldByProduct.get(m.product_id) ?? 0) + q);
    });

    const catName = new Map(categories.map((c) => [c.id, c.name]));

    return products
      .filter((p) => p.active !== false)
      .map((p) => {
        const sold = soldByProduct.get(p.id) ?? 0;
        const avgDaily = sold / WINDOW_DAYS;
        const stock = Number(p.stock_qty);
        const minStock = Number(p.min_stock);
        const need = avgDaily * targetDays + minStock - stock;
        const suggested = Math.max(0, Math.ceil(need));
        const match =
          matrizProducts.find((m) => p.sku && m.sku && m.sku === p.sku) ??
          matrizProducts.find(
            (m) => m.name.trim().toLowerCase() === p.name.trim().toLowerCase(),
          );
        const unitCents = Number(
          match?.wholesale_price_cents || match?.cost_cents || p.cost_cents || 0,
        );
        return {
          id: p.id,
          name: p.name,
          sku: p.sku,
          categoryId: p.category_id,
          categoryName: (p.category_id && catName.get(p.category_id)) || "Sem categoria",
          stock,
          minStock,
          sold,
          avgDaily,
          coverDays: avgDaily > 0 ? stock / avgDaily : Infinity,
          suggested,
          unitCents,
        };
      });
  }, [products, categories, sales, matrizProducts, targetDays]);

  const filtered = rows.filter((r) => {
    if (category !== "all" && (r.categoryId ?? "none") !== category) return false;
    if (onlyNeeded && r.suggested <= 0) return false;
    const term = search.trim().toLowerCase();
    if (term && !`${r.name} ${r.sku ?? ""}`.toLowerCase().includes(term)) return false;
    return true;
  });

  const orderQty = (r: Suggestion) => {
    const raw = qty[r.id];
    if (raw === undefined || raw === "") return r.suggested;
    return Math.max(0, Number(raw.replace(",", ".")) || 0);
  };

  const orderItems = filtered.filter((r) => orderQty(r) > 0);
  const orderTotal = orderItems.reduce((s, r) => s + orderQty(r) * r.unitCents, 0);

  const createOrder = useMutation({
    mutationFn: async () => {
      if (!orderItems.length) throw new Error("Nenhum item para pedir");
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Sessão expirada");

      const { data: purchase, error } = await supabase
        .from("purchases")
        .insert({
          user_id: uid,
          store_id: storeId,
          supplier: matriz?.name ?? "Matriz",
          issued_at: new Date().toISOString().slice(0, 10),
          notes: `Pedido de reposição (média de ${WINDOW_DAYS} dias, cobertura de ${targetDays} dias)`,
          freight_cents: 0,
          discount_cents: 0,
          status: "pedido",
          total_cents: Math.round(orderTotal),
        })
        .select()
        .single();
      if (error) throw error;

      const rowsToInsert = orderItems.map((r) => {
        const q = orderQty(r);
        return {
          user_id: uid,
          store_id: storeId,
          purchase_id: purchase.id,
          product_id: r.id,
          name: r.name,
          quantity: q,
          unit_cost_cents: r.unitCents,
          total_cents: Math.round(q * r.unitCents),
        };
      });
      const { error: itemErr } = await supabase.from("purchase_items").insert(rowsToInsert);
      if (itemErr) throw itemErr;
      return purchase.id;
    },
    onSuccess: () => {
      setQty({});
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["pedidos-lojas"] });
      toast.success("Pedido enviado para a matriz — acompanhe em Compras e relatório.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const needCount = rows.filter((r) => r.suggested > 0).length;
  const totalSuggested = rows.reduce((s, r) => s + r.suggested * r.unitCents, 0);

  return (
    <div className="space-y-5">
      <SectionTitle icon={Building2} tone="bg-chart-1/12 text-chart-1">
        Compras na matriz — sugestão por média de vendas
      </SectionTitle>

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi
          icon={TrendingDown}
          tone="bg-chart-4/15 text-chart-4"
          label="Produtos a repor"
          value={String(needCount)}
          hint={`${store?.name ?? "Loja"} · base ${WINDOW_DAYS} dias`}
        />
        <Kpi
          icon={ShoppingCart}
          tone="bg-chart-2/12 text-chart-2"
          label="Valor sugerido"
          value={brl(Math.round(totalSuggested))}
          hint={matriz ? `Preço de atacado ${matriz.name}` : "Preço de custo"}
        />
        <Kpi
          icon={PackageSearch}
          tone="bg-chart-1/12 text-chart-1"
          label="Itens no pedido"
          value={String(orderItems.length)}
          hint={brl(Math.round(orderTotal))}
        />
      </div>

      <div className="card-surface grid gap-3 p-4 md:grid-cols-4">
        <div>
          <Label>Buscar produto</Label>
          <Input
            placeholder="Nome ou SKU"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <Label>Categoria</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
              <SelectItem value="none">Sem categoria</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Cobertura desejada (dias)</Label>
          <Input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="numeric" />
        </div>
        <div className="flex items-end">
          <label className="flex h-10 cursor-pointer items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={onlyNeeded}
              onChange={(e) => setOnlyNeeded(e.target.checked)}
            />
            Só itens com sugestão
          </label>
        </div>
      </div>

      <div className="card-surface overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3 text-left">Produto</th>
              <th className="p-3 text-left">Categoria</th>
              <th className="p-3 text-right">Estoque</th>
              <th className="p-3 text-right">Mínimo</th>
              <th className="p-3 text-right">Vendas {WINDOW_DAYS}d</th>
              <th className="p-3 text-right">Média/dia</th>
              <th className="p-3 text-right">Cobertura</th>
              <th className="p-3 text-right">Sugestão</th>
              <th className="p-3 text-right">Unit. matriz</th>
              <th className="p-3 text-right">Pedir</th>
              <th className="p-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={11} className="p-10 text-center text-muted-foreground">
                  Nenhum produto encontrado com esses filtros.
                </td>
              </tr>
            )}
            {filtered.map((r) => {
              const q = orderQty(r);
              return (
                <tr key={r.id} className={r.stock <= r.minStock ? "bg-chart-4/5" : ""}>
                  <td className="p-3">
                    <p className="font-bold">{r.name}</p>
                    {r.sku && <p className="text-xs text-muted-foreground">{r.sku}</p>}
                  </td>
                  <td className="p-3 text-muted-foreground">{r.categoryName}</td>
                  <td className="p-3 text-right font-semibold">{r.stock}</td>
                  <td className="p-3 text-right text-muted-foreground">{r.minStock}</td>
                  <td className="p-3 text-right">{r.sold}</td>
                  <td className="p-3 text-right">{r.avgDaily.toFixed(2)}</td>
                  <td className="p-3 text-right">
                    {Number.isFinite(r.coverDays) ? `${r.coverDays.toFixed(1)} d` : "—"}
                  </td>
                  <td className="p-3 text-right font-black text-chart-2">{r.suggested}</td>
                  <td className="p-3 text-right">{brl(r.unitCents)}</td>
                  <td className="p-3 text-right">
                    <Input
                      className="ml-auto h-9 w-24 text-right"
                      value={qty[r.id] ?? String(r.suggested)}
                      onChange={(e) => setQty((s) => ({ ...s, [r.id]: e.target.value }))}
                      inputMode="decimal"
                    />
                  </td>
                  <td className="p-3 text-right font-bold">{brl(Math.round(q * r.unitCents))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card-surface flex flex-wrap items-center gap-3 p-4">
        <div className="mr-auto">
          <p className="text-xs text-muted-foreground">
            Pedido para {matriz?.name ?? "matriz"} · {orderItems.length} item(ns)
          </p>
          <p className="text-2xl font-black">{brl(Math.round(orderTotal))}</p>
        </div>
        <Button
          onClick={() => createOrder.mutate()}
          disabled={createOrder.isPending || orderItems.length === 0}
        >
          Gerar pedido de compra
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        A sugestão considera as saídas dos últimos {WINDOW_DAYS} dias (vendas, uso na cozinha e
        perdas): média diária × cobertura desejada + estoque mínimo − estoque atual. O pedido cai
        direto no painel "Pedidos das lojas" da matriz, que separa e envia a transferência para
        você conferir e autorizar.
      </p>
    </div>
  );
}

function Kpi({
  icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="card-surface p-5">
      <IconTile icon={icon as never} tone={tone} />
      <p className="mt-4 text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
