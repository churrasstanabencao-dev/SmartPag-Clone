import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  DollarSign,
  ImageIcon,
  Plus,
  Search,
  ShoppingCart,
  Utensils,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId, useStore } from "@/lib/store";
import { brl, dateTime, parseBRLToCents } from "@/lib/format";
import { PAYMENT_METHODS, methodLabel, type PaymentMethod } from "@/lib/smartpag";
import { baixarEstoqueDoPedido } from "@/lib/composicao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PedidoEditor } from "@/features/pdv-pedido-editor";


type ProductRow = {
  id: string;
  name: string;
  price_cents: number;
  category_id: string | null;
  image_url: string | null;
  stock_qty: number | null;
  min_stock: number | null;
  track_stock: boolean | null;
};

type TabRow = {
  id: string;
  name: string;
  kind: string;
  opened_at: string;
};

/**
 * App do garçom: pensado para celular e maquininha de cartão.
 * Categorias em abas, grade com foto do produto e selo de estoque
 * (verde com saldo, vermelho quando zerado/negativo), tudo em tempo real.
 */
export function GarcomApp() {
  const qc = useQueryClient();
  const { store } = useStore();
  const [tabId, setTabId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("dinheiro");
  const [pago, setPago] = useState("");
  const [caixaOpen, setCaixaOpen] = useState(false);


  // Tudo chega sozinho: venda em outro aparelho atualiza estoque e pedidos aqui.
  useEffect(() => {
    const refresh = () => {
      for (const key of ["tabs", "tab_items", "products", "garcom_tabs", "garcom_caixa"])
        qc.invalidateQueries({ queryKey: [key] });
    };
    const channel = supabase
      .channel("garcom-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "tabs" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "tab_items" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_movements" }, refresh)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  const { data: tabs = [] } = useQuery({
    queryKey: ["garcom_tabs"],
    refetchInterval: 20000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tabs")
        .select("id, name, kind, opened_at")
        .eq("store_id", currentStoreId())
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data as TabRow[];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories", "garcom"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, sort_order")
        .eq("store_id", currentStoreId())
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products", "garcom"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price_cents, category_id, image_url, stock_qty, min_stock, track_stock")
        .eq("store_id", currentStoreId())
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as ProductRow[];
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["tab_items", "garcom", tabId],
    enabled: !!tabId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tab_items")
        .select("id, product_id, quantity, unit_price_cents")
        .eq("tab_id", tabId!);
      if (error) throw error;
      return data;
    },
  });

  const { data: openRegister } = useQuery({
    queryKey: ["cash_registers", "open"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_registers")
        .select("id, name, opening_cents, opened_at")
        .eq("store_id", currentStoreId())
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Caixa do turno atual: vendas recebidas + suprimentos e sangrias.
  const { data: caixa } = useQuery({
    queryKey: ["garcom_caixa", openRegister?.id],
    enabled: !!openRegister?.id,
    queryFn: async () => {
      const [pay, mov] = await Promise.all([
        supabase
          .from("payments")
          .select("id, method, amount_cents, paid_at")
          .eq("register_id", openRegister!.id)
          .order("paid_at", { ascending: false }),
        supabase
          .from("cash_movements")
          .select("id, kind, description, method, amount_cents, created_at")
          .eq("register_id", openRegister!.id)
          .order("created_at", { ascending: false }),
      ]);
      if (pay.error) throw pay.error;
      if (mov.error) throw mov.error;
      return { pagamentos: pay.data ?? [], movimentos: mov.data ?? [] };
    },
  });



  const createTab = useMutation({
    mutationFn: async (kind: "mesa" | "balcão") => {
      const seq = tabs.filter((t) => t.kind === kind).length + 1;
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("tabs")
        .insert({
          user_id: auth.user!.id,
          store_id: currentStoreId(),
          name: `${kind === "mesa" ? "MESA" : "BALCÃO"} #${seq}`,
          kind,
          delivery_status: "fila",
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["garcom_tabs"] });
      setTabId(id);
      toast.success("Pedido aberto");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addItem = useMutation({
    mutationFn: async (p: ProductRow) => {
      const existing = items.find((i) => i.product_id === p.id);
      if (existing) {
        const { error } = await supabase
          .from("tab_items")
          .update({ quantity: Number(existing.quantity) + 1 })
          .eq("id", existing.id);
        if (error) throw error;
        return;
      }
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("tab_items").insert({
        user_id: auth.user!.id,
        store_id: currentStoreId(),
        tab_id: tabId!,
        product_id: p.id,
        name: p.name,
        quantity: 1,
        unit_price_cents: p.price_cents,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tab_items"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Alerta visual de estoque zerado, sem precisar abrir a tela de estoque.
  const zerados = useMemo(
    () => products.filter((p) => p.track_stock && Number(p.stock_qty ?? 0) <= 0),
    [products],
  );
  const avisados = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const p of zerados) {
      if (avisados.current.has(p.id)) continue;
      avisados.current.add(p.id);
      toast.error(`Estoque zerado: ${p.name}`);
    }
    for (const id of [...avisados.current])
      if (!zerados.some((p) => p.id === id)) avisados.current.delete(id);
  }, [zerados]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(
      (p) =>
        (category ? p.category_id === category : true) &&
        (q ? p.name.toLowerCase().includes(q) : true),
    );
  }, [products, category, search]);

  const count = items.reduce((s, i) => s + Number(i.quantity), 0);
  const total = items.reduce(
    (s, i) => s + Number(i.quantity) * Number(i.unit_price_cents),
    0,
  );

  const pagoCents = pago.trim() ? parseBRLToCents(pago) : total;
  const troco = Math.max(0, pagoCents - total);

  const receber = useMutation({
    mutationFn: async () => {
      if (total <= 0) throw new Error("Pedido sem itens");
      if (!openRegister?.id)
        throw new Error("Nenhum caixa aberto. Abra o caixa para receber.");
      if (pagoCents < total) throw new Error("Valor pago menor que o total do pedido");
      const { data: auth } = await supabase.auth.getUser();
      const { error: payError } = await supabase.from("payments").insert({
        user_id: auth.user!.id,
        store_id: currentStoreId(),
        tab_id: tabId!,
        method,
        amount_cents: total,
        register_id: openRegister.id,
      });
      if (payError) throw payError;

      await baixarEstoqueDoPedido({
        items: items.map((i) => ({
          product_id: i.product_id,
          quantity: Number(i.quantity),
        })),
        tabId: tabId!,
        userId: auth.user!.id,
      });

      const { error } = await supabase
        .from("tabs")
        .update({
          status: "closed",
          delivery_status: "finalizado",
          closed_at: new Date().toISOString(),
        })
        .eq("id", tabId!);
      if (error) throw error;
    },
    onSuccess: () => {
      for (const key of [
        "tabs",
        "tab_items",
        "payments",
        "products",
        "stock_movements",
        "cash_movements",
        "cash_sales",
        "cash_closures",
        "cash_report",
        "garcom_tabs",
        "bi-geral",
        "bi-vendas",
        "dashboard",
      ])
        qc.invalidateQueries({ queryKey: [key] });
      toast.success(
        troco > 0 ? `Pagamento registrado · troco ${brl(troco)}` : "Pagamento registrado",
      );
      setPayOpen(false);
      setPago("");
      setMethod("dinheiro");
      setTabId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });



  if (editorOpen && tabId) {
    return (
      <PedidoEditor
        tabId={tabId}
        mode="mesa"
        onClose={() => {
          setEditorOpen(false);
          qc.invalidateQueries({ queryKey: ["garcom_tabs"] });
        }}
      />
    );
  }

  if (payOpen && tabId) {
    return (
      <div className="mx-auto max-w-md space-y-4 pb-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setPayOpen(false)}>
            Voltar
          </Button>
          <h1 className="text-lg font-black uppercase">Pagamento</h1>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[11px] font-black uppercase text-muted-foreground">
            Total do pedido
          </p>
          <p className="text-3xl font-black tabular-nums">{brl(total)}</p>
        </div>

        <div>
          <p className="mb-2 text-sm font-black">Forma de pagamento</p>
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold ${
                  method === m.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card"
                }`}
              >
                <span className={`grid size-8 place-items-center rounded-lg ${m.tone}`}>
                  <DollarSign className="size-4" />
                </span>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-black">Valor recebido</p>
          <Input
            inputMode="numeric"
            value={pago}
            onChange={(e) => setPago(e.target.value)}
            placeholder={brl(total)}
            className="h-14 text-xl font-black"
          />
          {troco > 0 && (
            <p className="mt-2 text-sm font-bold text-chart-3">Troco: {brl(troco)}</p>
          )}
        </div>

        {!openRegister?.id && (
          <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">
            Nenhum caixa aberto. Abra o caixa no PDV para receber.
          </p>
        )}

        <Button
          className="h-14 w-full text-base font-black"
          disabled={receber.isPending}
          onClick={() => receber.mutate()}
        >
          Confirmar pagamento
        </Button>
      </div>
    );
  }



  // Caixa do garçom: saldo atual, entradas, saídas e histórico do turno.
  if (caixaOpen) {
    const vendas = (caixa?.pagamentos ?? []).reduce((s, p) => s + Number(p.amount_cents), 0);
    const suprimentos = (caixa?.movimentos ?? [])
      .filter((m) => m.kind === "entrada")
      .reduce((s, m) => s + Number(m.amount_cents), 0);
    const saidas = (caixa?.movimentos ?? [])
      .filter((m) => m.kind === "saida")
      .reduce((s, m) => s + Number(m.amount_cents), 0);
    const abertura = Number(openRegister?.opening_cents ?? 0);
    const entradas = vendas + suprimentos;
    const saldo = abertura + entradas - saidas;
    const historico = [
      ...(caixa?.pagamentos ?? []).map((p) => ({
        id: `p-${p.id}`,
        tipo: "entrada" as const,
        descricao: `Venda · ${methodLabel(p.method)}`,
        valor: Number(p.amount_cents),
        quando: p.paid_at,
      })),
      ...(caixa?.movimentos ?? []).map((m) => ({
        id: `m-${m.id}`,
        tipo: (m.kind === "entrada" ? "entrada" : "saida") as "entrada" | "saida",
        descricao: m.description,
        valor: Number(m.amount_cents),
        quando: m.created_at,
      })),
    ].sort((a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime());

    return (
      <div className="mx-auto max-w-md space-y-4 pb-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setCaixaOpen(false)}>
            Voltar
          </Button>
          <h1 className="text-lg font-black uppercase">Caixa</h1>
        </div>

        {!openRegister?.id ? (
          <p className="rounded-xl bg-destructive/10 px-3 py-3 text-sm font-semibold text-destructive">
            Nenhum caixa aberto nesta loja.
          </p>
        ) : (
          <>
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-[11px] font-black uppercase text-muted-foreground">
                Saldo atual · {openRegister.name}
              </p>
              <p className="text-3xl font-black tabular-nums">{brl(saldo)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Abertura {brl(abertura)} · {(caixa?.pagamentos ?? []).length} pagamento(s)
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-[11px] font-black uppercase text-muted-foreground">Entradas</p>
                <p className="text-xl font-black text-chart-2 tabular-nums">{brl(entradas)}</p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-[11px] font-black uppercase text-muted-foreground">Saídas</p>
                <p className="text-xl font-black text-destructive tabular-nums">{brl(saidas)}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card">
              <p className="border-b border-border px-4 py-3 text-sm font-black">
                Histórico ({historico.length})
              </p>
              {historico.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  Nenhum lançamento neste caixa.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {historico.map((h) => (
                    <div key={h.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{h.descricao}</p>
                        <p className="text-xs text-muted-foreground">{dateTime(h.quando)}</p>
                      </div>
                      <span
                        className={`ml-auto text-sm font-bold ${
                          h.tipo === "entrada" ? "text-chart-2" : "text-destructive"
                        }`}
                      >
                        {h.tipo === "entrada" ? "+" : "-"}
                        {brl(h.valor)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  if (!tabId) {
    return (
      <div className="mx-auto max-w-md space-y-4 pb-6">
        <div>
          <h1 className="text-xl font-black">Garçom</h1>
          <p className="text-sm text-muted-foreground">
            {store?.name ?? "Loja"} · escolha um pedido para lançar
          </p>
        </div>

        {zerados.length > 0 && (
          <div className="rounded-2xl border border-destructive bg-destructive/10 p-4">
            <p className="flex items-center gap-2 text-sm font-black text-destructive">
              <AlertTriangle className="size-4" /> {zerados.length} produto(s) sem estoque
            </p>
            <p className="mt-1 text-xs font-semibold text-destructive">
              {zerados.slice(0, 6).map((p) => p.name).join(" · ")}
              {zerados.length > 6 ? ` +${zerados.length - 6}` : ""}
            </p>
          </div>
        )}

        <Button
          variant="outline"
          className="h-12 w-full text-sm font-bold"
          onClick={() => setCaixaOpen(true)}
        >
          <Wallet className="mr-2 size-5" /> Caixa {openRegister?.id ? "" : "(fechado)"}
        </Button>

        <div className="grid grid-cols-2 gap-3">
          <Button
            className="h-14 text-base font-bold"
            onClick={() => createTab.mutate("mesa")}
          >
            <Plus className="mr-1 size-5" /> Nova mesa
          </Button>
          <Button
            variant="secondary"
            className="h-14 text-base font-bold"
            onClick={() => createTab.mutate("balcão")}
          >
            <Plus className="mr-1 size-5" /> Balcão
          </Button>
        </div>

        <div className="space-y-2">
          {tabs.length === 0 ? (
            <p className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Nenhum pedido aberto.
            </p>
          ) : (
            tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTabId(t.id)}
                className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-4 text-left"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <Utensils className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-bold">{t.name}</span>
                  <span className="block text-xs uppercase text-muted-foreground">
                    {t.kind}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  const currentTab = tabs.find((t) => t.id === tabId);

  return (
    <div className="mx-auto max-w-md pb-24">
      <div className="sticky top-0 z-10 -mx-4 space-y-2 bg-background/95 px-4 pb-2 pt-1 backdrop-blur">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setTabId(null)}>
            Voltar
          </Button>
          <p className="truncate text-sm font-black">{currentTab?.name ?? "Pedido"}</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar produto"
            className="h-11 pl-9"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setCategory(null)}
            className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-bold ${
              category === null ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            Todos
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-bold ${
                category === c.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {zerados.length > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-destructive bg-destructive/10 px-3 py-2 text-xs font-black text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="truncate">
            Sem estoque: {zerados.slice(0, 4).map((p) => p.name).join(" · ")}
            {zerados.length > 4 ? ` +${zerados.length - 4}` : ""}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 pt-3 sm:grid-cols-3">
        {visible.map((p) => {
          const controla = !!p.track_stock;
          const saldo = Number(p.stock_qty ?? 0);
          const semEstoque = controla && saldo <= 0;
          return (
            <button
              key={p.id}
              onClick={() => addItem.mutate(p)}
              className={`overflow-hidden rounded-2xl border bg-card text-left active:opacity-70 ${
                semEstoque ? "border-destructive ring-1 ring-destructive" : "border-border"
              }`}
            >
              <div className="relative aspect-square w-full bg-muted">
                {p.image_url ? (
                  <img
                    src={p.image_url}
                    alt={p.name}
                    loading="lazy"
                    className="size-full object-cover"
                  />
                ) : (
                  <span className="flex size-full items-center justify-center text-muted-foreground">
                    <ImageIcon className="size-7" />
                  </span>
                )}
                {controla && (
                  <span
                    className={`absolute bottom-1.5 left-1.5 rounded-full px-2 py-0.5 text-[11px] font-black text-white ${
                      saldo > 0 ? "bg-emerald-600" : "bg-destructive"
                    }`}
                  >
                    {saldo}
                  </span>
                )}
                {semEstoque && (
                  <span className="absolute inset-x-0 top-0 flex items-center justify-center gap-1 bg-destructive/90 py-1 text-[10px] font-black uppercase text-white">
                    <AlertTriangle className="size-3" /> Sem estoque
                  </span>
                )}
              </div>
              <div className="px-2 py-2">
                <p className="text-sm font-black">{brl(Number(p.price_cents))}</p>
                <p className="line-clamp-2 text-xs font-semibold uppercase leading-tight text-muted-foreground">
                  {p.name}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {visible.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Nenhum produto encontrado.
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-2 gap-2 border-t border-border bg-card px-4 py-3">
        <Button
          variant="secondary"
          className="h-14 text-sm font-black"
          onClick={() => setEditorOpen(true)}
        >
          <ShoppingCart className="mr-2 size-5" />
          {count} · {brl(total)}
        </Button>
        <Button
          className="h-14 text-sm font-black"
          disabled={total <= 0}
          onClick={() => setPayOpen(true)}
        >
          <DollarSign className="mr-1 size-5" /> Receber
        </Button>
      </div>

    </div>
  );
}
