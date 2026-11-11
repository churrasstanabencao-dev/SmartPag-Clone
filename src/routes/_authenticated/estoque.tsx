import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Boxes,
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  PackageSearch,
  ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId, useStore } from "@/lib/store";
import { brl, dateTime } from "@/lib/format";
import { STOCK_REASONS, stockReasonLabel } from "@/lib/smartpag";
import { SectionTitle, IconTile } from "@/components/AppShell";
import { BiEstoque } from "@/features/bi-estoque";
import { ComprasModule } from "@/features/compras";
import { BaixaManualModule } from "@/features/baixa-manual";
import { ComprasMatrizModule } from "@/features/compras-matriz";
import { PedidosLojasModule } from "@/features/pedidos-lojas";
import { PedidosPendentesModule } from "@/features/pedidos-pendentes";
import { TransferenciasModule } from "@/features/transferencias";
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

export const Route = createFileRoute("/_authenticated/estoque")({
  head: () => ({
    meta: [
      { title: "Estoque da cozinha — SmartPag" },
      {
        name: "description",
        content:
          "Registre entradas e saídas de estoque por produto, acompanhe o saldo da cozinha e receba alertas de estoque mínimo.",
      },
      { property: "og:title", content: "Estoque — SmartPag" },
      {
        property: "og:description",
        content: "Tudo que entra e sai da cozinha, produto a produto.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Estoque,
});

function Estoque() {
  const { isMatriz } = useStore();
  const [mainTab, setMainTab] = useState<
    "bi" | "estoque" | "baixa" | "consumo" | "movcomanda" | "compras" | "matriz" | "pedidos" | "pendentes" | "transferencias"
  >("estoque");
  type TabId = typeof mainTab;
  const tabs: { id: TabId; label: string }[] = [
    { id: "bi", label: "BI & Relatórios" },
    { id: "estoque", label: "Movimentações de estoque" },
    { id: "baixa", label: "Baixa manual / perdas" },
    { id: "consumo", label: "Consumo por comanda" },
    { id: "movcomanda", label: "Movimentações por comanda" },
    { id: "compras", label: "Compras e relatório" },
    ...(isMatriz
      ? [{ id: "pedidos" as TabId, label: "Pedidos das lojas" }]
      : [
          { id: "matriz" as TabId, label: "Compras matriz" },
          { id: "pendentes" as TabId, label: "Pedidos pendentes" },
        ]),
    { id: "transferencias", label: "Venda / transferência para lojas" },
  ];
  return (
    <div className="space-y-5">
      <div className="flex w-fit flex-wrap gap-1 rounded-2xl bg-muted p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setMainTab(t.id)}
            className={
              "rounded-xl px-4 py-2 text-sm font-bold transition-colors " +
              (mainTab === t.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      {mainTab === "bi" ? (
        <BiEstoque />
      ) : mainTab === "estoque" ? (
        <EstoqueMovimentos />
      ) : mainTab === "baixa" ? (
        <BaixaManualModule />
      ) : mainTab === "consumo" ? (
        <ConsumoPorComanda />
      ) : mainTab === "movcomanda" ? (
        <MovimentacoesPorComanda />
      ) : mainTab === "matriz" ? (
        <ComprasMatrizModule />
      ) : mainTab === "pedidos" ? (
        <PedidosLojasModule />
      ) : mainTab === "pendentes" ? (
        <PedidosPendentesModule />
      ) : mainTab === "transferencias" ? (
        <TransferenciasModule />
      ) : (
        <ComprasModule />
      )}
    </div>
  );
}


function ConsumoPorComanda() {
  const [days, setDays] = useState("30");
  const [search, setSearch] = useState("");
  const since = useMemo(() => {
    const d = new Date(Date.now() - (Number(days) - 1) * 86400000);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [days]);

  const { data: items = [] } = useQuery({
    queryKey: ["tab_items", "consumo", days],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tab_items")
        .select("*, tabs(name, kind, status, opened_at, closed_at)")
        .eq("store_id", currentStoreId())
        .gte("created_at", since)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    refetchInterval: 20000,
  });

  const grouped = useMemo(() => {
    type Group = {
        name: string;
        qty: number;
        value: number;
        rows: {
          id: string;
          comanda: string;
          kind: string;
          status: string;
          qty: number;
          value: number;
        at: string;
      }[];
    };
    const map = new Map<string, Group>();
    for (const i of items) {
      const key = i.product_id ?? `avulso:${i.name}`;
      const value = Number(i.quantity) * Number(i.unit_price_cents);
      const entry: Group =
        map.get(key) ?? { name: i.name, qty: 0, value: 0, rows: [] };
      entry.qty += Number(i.quantity);
      entry.value += value;
      entry.rows.push({
        id: i.id,
        comanda: i.tabs?.name ?? "Comanda removida",
        kind: i.tabs?.kind ?? "-",
        status: i.tabs?.status ?? "-",
        qty: Number(i.quantity),
        value,
        at: i.created_at,
      });
      map.set(key, entry);
    }
    return [...map.values()]
      .filter((g) => g.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.qty - a.qty);
  }, [items, search]);

  const totalQty = grouped.reduce((s, g) => s + g.qty, 0);
  const totalValue = grouped.reduce((s, g) => s + g.value, 0);

  return (
    <div className="space-y-5">
      <SectionTitle icon={ClipboardList} tone="bg-chart-4/12 text-chart-4">
        Consumo por comanda
      </SectionTitle>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Label>Período</Label>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-60">
          <Label>Buscar produto</Label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nome do produto"
          />
        </div>
        <div className="ml-auto flex gap-3">
          <div className="card-surface px-4 py-2">
            <p className="text-xs text-muted-foreground">Itens consumidos</p>
            <p className="text-lg font-bold">{totalQty}</p>
          </div>
          <div className="card-surface px-4 py-2">
            <p className="text-xs text-muted-foreground">Valor consumido</p>
            <p className="text-lg font-bold text-primary">{brl(totalValue)}</p>
          </div>
        </div>
      </div>

      <div className="card-surface">
        <h3 className="border-b border-border px-5 py-3 font-bold">
          Produtos e comandas que consumiram
        </h3>
        <div className="divide-y divide-border">
          {grouped.length === 0 && (
            <p className="p-10 text-center text-sm text-muted-foreground">
              Nenhum consumo registrado no período.
            </p>
          )}
          {grouped.map((g) => (
            <details key={g.name} className="group">
              <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-5 py-3">
                <IconTile icon={PackageSearch} tone="bg-chart-4/12 text-chart-4" />
                <div className="min-w-0">
                  <p className="truncate font-bold">{g.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {g.rows.length} comanda(s)
                  </p>
                </div>
                <div className="ml-auto flex gap-6 text-right">
                  <div>
                    <p className="text-xs text-muted-foreground">Quantidade</p>
                    <p className="font-bold">{g.qty}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Valor</p>
                    <p className="font-bold text-primary">{brl(g.value)}</p>
                  </div>
                </div>
              </summary>
              <div className="divide-y divide-border border-t border-border bg-muted/40">
                {g.rows.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-2 pl-16">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{r.comanda}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.kind} · {r.status === "open" ? "aberta" : "fechada"} ·{" "}
                        {dateTime(r.at)}
                      </p>
                    </div>
                    <div className="ml-auto flex gap-6 text-right">
                      <p className="text-sm font-semibold">{r.qty}x</p>
                      <p className="text-sm font-semibold text-primary">{brl(r.value)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}

type Kind = "entrada" | "saida";

function EstoqueMovimentos() {
  const qc = useQueryClient();
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [kind, setKind] = useState<Kind>("entrada");
  const [reason, setReason] = useState("compra");
  const [filterProduct, setFilterProduct] = useState("todos");

  const { data: products = [] } = useQuery({
    queryKey: ["products", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*")
        .eq("store_id", currentStoreId()).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: movements = [] } = useQuery({
    queryKey: ["stock_movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("*")
        .eq("store_id", currentStoreId())
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const reasonsForKind = STOCK_REASONS.filter((r) => r.kind === kind);

  function changeKind(next: Kind) {
    setKind(next);
    setReason(next === "entrada" ? "compra" : "uso_cozinha");
  }

  const move = useMutation({
    mutationFn: async () => {
      const product = products.find((p) => p.id === productId);
      if (!product) throw new Error("Selecione um produto");
      const amount = Math.abs(Number(qty.replace(",", ".")) || 0);
      if (amount <= 0) throw new Error("Informe uma quantidade válida");
      const delta = kind === "entrada" ? amount : -amount;
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("stock_movements").insert({
        user_id: auth.user!.id,
        store_id: currentStoreId(),
        product_id: product.id,
        quantity: delta,
        reason,
      });
      if (error) throw error;
      const { error: upErr } = await supabase
        .from("products")
        .update({
          stock_qty: Number(product.stock_qty) + delta,
          track_stock: true,
        })
        .eq("id", product.id);
      if (upErr) throw upErr;
    },
    onSuccess: () => {
      setQty("1");
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      toast.success("Movimentação registrada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const productName = (id: string) =>
    products.find((p) => p.id === id)?.name ?? "Produto removido";

  const today = new Date().toISOString().slice(0, 10);
  const todayMoves = movements.filter((m) => m.created_at.slice(0, 10) === today);
  const inToday = todayMoves
    .filter((m) => Number(m.quantity) > 0)
    .reduce((s, m) => s + Number(m.quantity), 0);
  const outToday = todayMoves
    .filter((m) => Number(m.quantity) < 0)
    .reduce((s, m) => s + Math.abs(Number(m.quantity)), 0);

  const tracked = products.filter((p) => p.track_stock);
  const lowStock = tracked.filter((p) => Number(p.stock_qty) <= Number(p.min_stock));

  const filtered = useMemo(
    () =>
      filterProduct === "todos"
        ? movements
        : movements.filter((m) => m.product_id === filterProduct),
    [movements, filterProduct],
  );

  return (
    <div className="space-y-6">
      <SectionTitle icon={Boxes} tone="bg-chart-2/12 text-chart-2">
        Estoque da cozinha
      </SectionTitle>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Entradas hoje", value: inToday, tone: "bg-chart-2/12 text-chart-2" },
          { label: "Saídas hoje", value: outToday, tone: "bg-destructive/10 text-destructive" },
          { label: "Itens controlados", value: tracked.length, tone: "bg-chart-1/12 text-chart-1" },
          { label: "No mínimo", value: lowStock.length, tone: "bg-chart-4/12 text-chart-4" },
        ].map((c) => (
          <div key={c.label} className="card-surface p-5">
            <p className="text-xs font-semibold text-muted-foreground">{c.label}</p>
            <p className="mt-1 text-2xl font-black">{c.value}</p>
            <span className={`mt-3 inline-block h-1.5 w-10 rounded-full ${c.tone}`} />
          </div>
        ))}
      </div>

      {lowStock.length > 0 && (
        <div className="card-surface flex items-center gap-3 border-chart-4/40 p-4">
          <AlertTriangle className="size-5 text-chart-4" />
          <p className="text-sm">
            <span className="font-bold">{lowStock.length}</span> produto(s) no estoque mínimo:{" "}
            {lowStock.map((p) => p.name).join(", ")}
          </p>
        </div>
      )}

      <div className="card-surface flex flex-wrap items-end gap-3 p-5">
        <div className="w-60 space-y-2">
          <Label>Produto</Label>
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-36 space-y-2">
          <Label>Tipo</Label>
          <Select value={kind} onValueChange={(v) => changeKind(v as Kind)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="entrada">Entrada</SelectItem>
              <SelectItem value="saida">Saída</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-52 space-y-2">
          <Label>Motivo</Label>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {reasonsForKind.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-28 space-y-2">
          <Label>Qtd.</Label>
          <Input
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/[^\d.,]/g, ""))}
            inputMode="decimal"
          />
        </div>
        <Button disabled={!productId || move.isPending} onClick={() => move.mutate()}>
          Registrar
        </Button>
        {products.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Cadastre produtos em Cadastro para movimentar o estoque.
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card-surface">
          <h3 className="border-b border-border px-5 py-3 font-bold">Saldo por produto</h3>
          <div className="divide-y divide-border">
            {products.length === 0 && (
              <p className="p-10 text-center text-sm text-muted-foreground">
                Cadastre produtos primeiro.
              </p>
            )}
            {products.map((p) => {
              const low = p.track_stock && Number(p.stock_qty) <= Number(p.min_stock);
              return (
                <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <IconTile
                    icon={PackageSearch}
                    tone={low ? "bg-chart-4/12 text-chart-4" : "bg-muted text-muted-foreground"}
                  />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      mínimo {Number(p.min_stock)}
                      {p.sku ? ` · ${p.sku}` : ""}
                    </p>
                  </div>
                  <span
                    className={`ml-auto text-right text-lg font-black ${
                      low ? "text-chart-4" : ""
                    }`}
                  >
                    {Number(p.stock_qty)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card-surface">
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
            <h3 className="font-bold">Entradas e saídas</h3>
            <div className="ml-auto w-52">
              <Select value={filterProduct} onValueChange={setFilterProduct}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os produtos</SelectItem>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="max-h-[520px] divide-y divide-border overflow-y-auto">
            {filtered.length === 0 && (
              <p className="p-10 text-center text-sm text-muted-foreground">
                Nenhuma movimentação registrada.
              </p>
            )}
            {filtered.map((m) => {
              const isIn = Number(m.quantity) >= 0;
              return (
                <div key={m.id} className="flex items-center gap-3 px-5 py-3">
                  <IconTile
                    icon={isIn ? ArrowDownCircle : ArrowUpCircle}
                    tone={
                      isIn
                        ? "bg-chart-2/12 text-chart-2"
                        : "bg-destructive/10 text-destructive"
                    }
                  />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{productName(m.product_id)}</p>
                    <p className="text-xs text-muted-foreground">
                      {stockReasonLabel(m.reason)} · {dateTime(m.created_at)}
                    </p>
                  </div>
                  <span
                    className={`ml-auto font-bold ${
                      isIn ? "text-chart-2" : "text-destructive"
                    }`}
                  >
                    {isIn ? "+" : ""}
                    {Number(m.quantity)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function MovimentacoesPorComanda() {
  const [days, setDays] = useState("30");
  const [search, setSearch] = useState("");
  const [filterComanda, setFilterComanda] = useState("todas");
  const since = useMemo(() => {
    const d = new Date(Date.now() - (Number(days) - 1) * 86400000);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [days]);

  const { data: products = [] } = useQuery({
    queryKey: ["products", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*")
        .eq("store_id", currentStoreId()).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: movements = [] } = useQuery({
    queryKey: ["stock_movements", "comanda", days],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("*, tabs(name, kind, status, opened_at, closed_at)")
        .eq("store_id", currentStoreId())
        .not("tab_id", "is", null)
        .gte("created_at", since)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    refetchInterval: 20000,
  });

  const comandas = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of movements) {
      if (m.tab_id && !map.has(m.tab_id)) {
        map.set(m.tab_id, m.tabs?.name ?? "Comanda removida");
      }
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [movements]);

  const productName = (id: string) =>
    products.find((p) => p.id === id)?.name ?? "Produto removido";

  const filtered = useMemo(() => {
    return movements.filter((m) => {
      if (filterComanda !== "todas" && m.tab_id !== filterComanda) return false;
      const name = productName(m.product_id).toLowerCase();
      if (!name.includes(search.toLowerCase())) return false;
      return true;
    });
  }, [movements, filterComanda, search, products]);

  const entradas = filtered.filter((m) => Number(m.quantity) >= 0);
  const saidas = filtered.filter((m) => Number(m.quantity) < 0);
  const totalEntradas = entradas.reduce((s, m) => s + Number(m.quantity), 0);
  const totalSaidas = saidas.reduce((s, m) => s + Math.abs(Number(m.quantity)), 0);

  return (
    <div className="space-y-5">
      <SectionTitle icon={ClipboardList} tone="bg-chart-4/12 text-chart-4">
        Movimentações por comanda
      </SectionTitle>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Label>Período</Label>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-60">
          <Label>Comanda</Label>
          <Select value={filterComanda} onValueChange={setFilterComanda}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as comandas</SelectItem>
              {comandas.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-60">
          <Label>Buscar produto</Label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nome do produto"
          />
        </div>
        <div className="ml-auto flex gap-3">
          <div className="card-surface px-4 py-2">
            <p className="text-xs text-muted-foreground">Entradas</p>
            <p className="text-lg font-bold text-chart-2">+{totalEntradas}</p>
          </div>
          <div className="card-surface px-4 py-2">
            <p className="text-xs text-muted-foreground">Saídas</p>
            <p className="text-lg font-bold text-destructive">-{totalSaidas}</p>
          </div>
          <div className="card-surface px-4 py-2">
            <p className="text-xs text-muted-foreground">Movimentações</p>
            <p className="text-lg font-bold">{filtered.length}</p>
          </div>
        </div>
      </div>

      <div className="card-surface">
        <h3 className="border-b border-border px-5 py-3 font-bold">
          Movimentações por comanda
        </h3>
        <div className="max-h-[600px] divide-y divide-border overflow-y-auto">
          {filtered.length === 0 && (
            <p className="p-10 text-center text-sm text-muted-foreground">
              Nenhuma movimentação vinculada a comanda no período.
              <br />
              <span className="text-xs">
                As baixas de venda ocorrem ao fechar comandas com produtos
                controlados por estoque.
              </span>
            </p>
          )}
          {filtered.map((m) => {
            const isIn = Number(m.quantity) >= 0;
            const comanda = m.tabs?.name ?? "Comanda removida";
            const kind = m.tabs?.kind ?? "-";
            const status = m.tabs?.status ?? "-";
            return (
              <div key={m.id} className="flex items-center gap-3 px-5 py-3">
                <IconTile
                  icon={isIn ? ArrowDownCircle : ArrowUpCircle}
                  tone={
                    isIn
                      ? "bg-chart-2/12 text-chart-2"
                      : "bg-destructive/10 text-destructive"
                  }
                />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{productName(m.product_id)}</p>
                  <p className="text-xs text-muted-foreground">
                    {comanda} · {kind}
                    {status === "open" ? " · aberta" : " · fechada"} ·{" "}
                    {dateTime(m.created_at)}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-3 text-right">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                    {isIn ? "Entrada" : "Saída"}
                  </span>
                  <span
                    className={`font-bold ${
                      isIn ? "text-chart-2" : "text-destructive"
                    }`}
                  >
                    {isIn ? "+" : ""}
                    {Number(m.quantity)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
