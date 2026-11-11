import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ClipboardList, PackagePlus, Truck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store";
import { brl, parseBRLToCents, shortDate } from "@/lib/format";
import { FornecedoresTab } from "@/features/fornecedores";
import { IconTile } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  stock_qty: number;
  min_stock: number;
  cost_cents: number;
};

const today = () => new Date().toISOString().slice(0, 10);

const STATUS: Record<string, string> = {
  draft: "Rascunho",
  sent: "Aguardando conferência",
  approved: "Autorizado",
  confirmed: "Confirmado",
  rejected: "Recusado",
  pedido: "Enviado à matriz",
  atendida: "Atendido",
};

export function FornecedoresPedidos() {
  const qc = useQueryClient();
  const { stores, storeId: activeStoreId } = useStore();
  const [storeId, setStoreId] = useState(activeStoreId ?? stores[0]?.id ?? "");
  const [supplier, setSupplier] = useState("");
  const [date, setDate] = useState(today());
  const [search, setSearch] = useState("");
  const [onlyNeeded, setOnlyNeeded] = useState(true);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [costs, setCosts] = useState<Record<string, string>>({});

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name, active")
        .eq("store_id", storeId)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["supplier-orders-products", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, unit, stock_qty, min_stock, cost_cents")
        .eq("store_id", storeId)
        .eq("active", true)
        .eq("track_stock", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as ProductRow[];
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["supplier-orders", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("id, supplier, issued_at, total_cents, status, created_at, purchase_items(quantity)")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const quantityFor = (product: ProductRow) => {
    const saved = quantities[product.id];
    if (saved !== undefined) return Math.max(0, Number(saved.replace(",", ".")) || 0);
    return Math.max(0, Number(product.min_stock) - Number(product.stock_qty));
  };

  const costFor = (product: ProductRow) => {
    const saved = costs[product.id];
    return saved !== undefined ? parseBRLToCents(saved) : Number(product.cost_cents);
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((product) => {
      const missing = Math.max(0, Number(product.min_stock) - Number(product.stock_qty));
      if (onlyNeeded && missing <= 0) return false;
      return !term || `${product.name} ${product.sku ?? ""}`.toLowerCase().includes(term);
    });
  }, [products, search, onlyNeeded]);

  const selected = products.filter((product) => quantityFor(product) > 0);
  const totalQuantity = selected.reduce((sum, product) => sum + quantityFor(product), 0);
  const totalValue = selected.reduce(
    (sum, product) => sum + quantityFor(product) * costFor(product),
    0,
  );

  const saveOrder = useMutation({
    mutationFn: async () => {
      if (!storeId) throw new Error("Selecione uma loja");
      if (!supplier) throw new Error("Selecione um fornecedor");
      if (!selected.length) throw new Error("Informe a quantidade de ao menos um produto");
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Sessão expirada");
      const supplierName = suppliers.find((item) => item.id === supplier)?.name;
      if (!supplierName) throw new Error("Fornecedor não encontrado");

      const { data: purchase, error } = await supabase
        .from("purchases")
        .insert({
          user_id: userId,
          store_id: storeId,
          supplier: supplierName,
          issued_at: date,
          notes: "Pedido de reposição por estoque mínimo",
          freight_cents: 0,
          discount_cents: 0,
          total_cents: Math.round(totalValue),
          status: "draft",
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: itemsError } = await supabase.from("purchase_items").insert(
        selected.map((product) => {
          const quantity = quantityFor(product);
          const unitCost = costFor(product);
          return {
            user_id: userId,
            store_id: storeId,
            purchase_id: purchase.id,
            product_id: product.id,
            name: product.name,
            quantity,
            unit_cost_cents: unitCost,
            total_cents: Math.round(quantity * unitCost),
          };
        }),
      );
      if (itemsError) throw itemsError;
    },
    onSuccess: () => {
      setQuantities({});
      setCosts({});
      qc.invalidateQueries({ queryKey: ["supplier-orders"] });
      qc.invalidateQueries({ queryKey: ["purchases"] });
      toast.success("Pedido salvo em Compras para conferência");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const criticalCount = products.filter(
    (product) => Number(product.stock_qty) <= Number(product.min_stock),
  ).length;

  return (
    <div className="space-y-5">
      <div className="card-surface flex flex-wrap items-end gap-3 p-4">
        <div className="w-full space-y-2 sm:w-72">
          <Label>Loja</Label>
          <Select
            value={storeId}
            onValueChange={(value) => {
              setStoreId(value);
              setSupplier("");
              setQuantities({});
              setCosts({});
            }}
          >
            <SelectTrigger><SelectValue placeholder="Selecione a loja" /></SelectTrigger>
            <SelectContent>
              {stores.map((store) => <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex items-center gap-3 rounded-lg bg-destructive/5 px-4 py-2 text-sm">
          <AlertTriangle className="size-4 text-destructive" />
          <span><strong>{criticalCount}</strong> produto(s) no estoque mínimo</span>
        </div>
      </div>

      <Tabs defaultValue="pedido" className="space-y-5">
        <TabsList>
          <TabsTrigger value="pedido">Novo pedido</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          <TabsTrigger value="fornecedores">Fornecedores</TabsTrigger>
        </TabsList>

        <TabsContent value="pedido" className="space-y-5">
          <div className="card-surface grid gap-4 p-5 md:grid-cols-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Fornecedor</Label>
              <Select value={supplier} onValueChange={setSupplier}>
                <SelectTrigger><SelectValue placeholder="Escolha o fornecedor deste pedido" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Data do pedido</Label>
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Buscar produto</Label>
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome ou SKU" />
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold md:col-span-4">
              <input type="checkbox" className="size-4 accent-primary" checked={onlyNeeded} onChange={(event) => setOnlyNeeded(event.target.checked)} />
              Mostrar somente produtos que precisam de reposição
            </label>
          </div>

          <div className="card-surface overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3 text-left">Produto</th>
                  <th className="p-3 text-right">Estoque atual</th>
                  <th className="p-3 text-right">Estoque mínimo</th>
                  <th className="p-3 text-right">Falta pedir</th>
                  <th className="p-3 text-right">Quantidade</th>
                  <th className="p-3 text-right">Valor unitário</th>
                  <th className="p-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 && <tr><td colSpan={7} className="p-10 text-center text-muted-foreground">Nenhum produto encontrado.</td></tr>}
                {filtered.map((product) => {
                  const missing = Math.max(0, Number(product.min_stock) - Number(product.stock_qty));
                  const quantity = quantityFor(product);
                  const unitCost = costFor(product);
                  return (
                    <tr key={product.id} className={missing > 0 ? "bg-destructive/5" : undefined}>
                      <td className="p-3"><p className="font-bold">{product.name}</p><p className="text-xs text-muted-foreground">{product.sku || "Sem SKU"} · {product.unit || "un"}</p></td>
                      <td className="p-3 text-right font-semibold">{Number(product.stock_qty)}</td>
                      <td className="p-3 text-right">{Number(product.min_stock)}</td>
                      <td className="p-3 text-right font-black text-destructive">{missing}</td>
                      <td className="p-3"><Input className="ml-auto w-24 text-right" inputMode="decimal" value={quantities[product.id] ?? String(missing)} onChange={(event) => setQuantities((current) => ({ ...current, [product.id]: event.target.value.replace(/[^\d.,]/g, "") }))} /></td>
                      <td className="p-3"><Input className="ml-auto w-32 text-right" inputMode="numeric" value={costs[product.id] ?? brl(Number(product.cost_cents))} onChange={(event) => setCosts((current) => ({ ...current, [product.id]: event.target.value }))} /></td>
                      <td className="p-3 text-right font-bold">{brl(Math.round(quantity * unitCost))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="card-surface flex flex-wrap items-center gap-4 p-5">
            <IconTile icon={PackagePlus} tone="bg-chart-2/12 text-chart-2" />
            <div className="mr-auto"><p className="text-sm text-muted-foreground">{selected.length} produto(s) · {totalQuantity.toLocaleString("pt-BR")} unidade(s)</p><p className="text-2xl font-black">{brl(Math.round(totalValue))}</p></div>
            <Button disabled={!supplier || !selected.length || saveOrder.isPending} onClick={() => saveOrder.mutate()}><ClipboardList className="size-4" /> Salvar pedido</Button>
          </div>
        </TabsContent>

        <TabsContent value="historico">
          <div className="card-surface divide-y divide-border">
            {orders.length === 0 && <p className="p-10 text-center text-sm text-muted-foreground">Nenhum pedido registrado para esta loja.</p>}
            {orders.map((order) => {
              const quantity = order.purchase_items.reduce((sum, item) => sum + Number(item.quantity), 0);
              return (
                <div key={order.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <IconTile icon={Truck} tone="bg-chart-1/12 text-chart-1" />
                  <div className="mr-auto"><p className="font-bold">{order.supplier}</p><p className="text-xs text-muted-foreground">{shortDate(order.issued_at)} · {quantity.toLocaleString("pt-BR")} unidade(s) · {STATUS[order.status] ?? order.status}</p></div>
                  <p className="text-lg font-black">{brl(Number(order.total_cents))}</p>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="fornecedores">
          <FornecedoresTab storeId={storeId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
