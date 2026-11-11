import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Receipt,
  Plus,
  Trash2,
  CheckCircle2,
  Wallet,
  LayoutGrid,
  Minus,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId } from "@/lib/store";
import { baixarEstoqueDoPedido } from "@/lib/composicao";
import { brl, dateTime, parseBRLToCents } from "@/lib/format";
import { PAYMENT_METHODS, TAB_KINDS, type PaymentMethod } from "@/lib/smartpag";
import { SectionTitle } from "@/components/AppShell";
import { RelatorioVendas } from "@/features/relatorios";
import { PedidoEditor } from "@/features/pdv-pedido-editor";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ComandasModule({ embedded = false }: { embedded?: boolean }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const openEditor = (id: string) => {
    setSelected(id);
    setEditing(id);
  };
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<string>("mesa");
  const [method, setMethod] = useState<PaymentMethod>("pix");
  const [received, setReceived] = useState("");
  const [lastClose, setLastClose] = useState<{
    name: string;
    total: number;
    received: number;
    change: number;
    method: PaymentMethod;
  } | null>(null);
  const [lastStock, setLastStock] = useState<{ name: string; qty: number }[]>([]);
  const [view, setView] = useState<"mapa" | "lista" | "relatorio">("mapa");
  const [mesaCount, setMesaCount] = useState(12);
  const [mesaFilter, setMesaFilter] = useState<"todas" | "ocupadas" | "livres">(
    "todas",
  );

  useEffect(() => {
    const saved = Number(localStorage.getItem("smartpag_mesas") ?? "");
    if (saved > 0) setMesaCount(saved);
  }, []);

  const changeMesaCount = (n: number) => {
    const next = Math.min(60, Math.max(1, n));
    setMesaCount(next);
    localStorage.setItem("smartpag_mesas", String(next));
  };



  const { data: tabs = [] } = useQuery({
    queryKey: ["tabs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tabs")
        .select("*")
        .eq("store_id", currentStoreId())
        .order("opened_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("store_id", currentStoreId())
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, name, commission_pct")
        .eq("store_id", currentStoreId())
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: openTotals = {} } = useQuery({
    queryKey: ["tab_items", "open_totals"],
    refetchInterval: 15000,
    queryFn: async () => {
      const { data: openTabs, error: te } = await supabase
        .from("tabs")
        .select("id")
        .eq("store_id", currentStoreId())
        .eq("status", "open");
      if (te) throw te;
      const ids = (openTabs ?? []).map((t) => t.id);
      if (ids.length === 0) return {} as Record<string, number>;
      const { data, error } = await supabase
        .from("tab_items")
        .select("tab_id, quantity, unit_price_cents")
        .eq("store_id", currentStoreId())
        .in("tab_id", ids);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const i of data ?? []) {
        map[i.tab_id] =
          (map[i.tab_id] ?? 0) +
          Number(i.unit_price_cents) * Number(i.quantity);
      }
      return map;
    },
  });

  const current = tabs.find((t) => t.id === selected) ?? null;


  const { data: items = [] } = useQuery({
    queryKey: ["tab_items", selected],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tab_items")
        .select("*")
        .eq("store_id", currentStoreId())
        .eq("tab_id", selected!)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: openRegister } = useQuery({
    queryKey: ["cash_registers", "open"],
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_registers")
        .select("id, name, opened_at")
        .eq("store_id", currentStoreId())
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const totalCents = items.reduce(
    (s, i) => s + Number(i.unit_price_cents) * Number(i.quantity),
    0,
  );

  const reservedByProduct = items.reduce<Record<string, number>>((acc, i) => {
    if (i.product_id) acc[i.product_id] = (acc[i.product_id] ?? 0) + Number(i.quantity);
    return acc;
  }, {});

  const receivedCents = parseBRLToCents(received);
  const isCash = method === "dinheiro";
  const changeCents = isCash ? Math.max(0, receivedCents - totalCents) : 0;
  const missingCents = isCash ? Math.max(0, totalCents - receivedCents) : 0;

  useEffect(() => {
    setReceived("");
  }, [selected]);



  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tabs"] });
    qc.invalidateQueries({ queryKey: ["tab_items"] });
    qc.invalidateQueries({ queryKey: ["payments"] });
    qc.invalidateQueries({ queryKey: ["cash_registers"] });
    qc.invalidateQueries({ queryKey: ["cash_movements"] });
    qc.invalidateQueries({ queryKey: ["cash_report"] });
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["stock_movements"] });
  };


  const createTab = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("tabs")
        .insert({ user_id: auth.user!.id,
        store_id: currentStoreId(), name: newName.trim().toUpperCase(), kind: newKind })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (t) => {
      setNewName("");
      openEditor(t.id);
      invalidate();
      toast.success("Comanda aberta");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openMesa = useMutation({
    mutationFn: async (name: string) => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("tabs")
        .insert({ user_id: auth.user!.id,
        store_id: currentStoreId(), name, kind: "mesa" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (t) => {
      openEditor(t.id);
      invalidate();
      toast.success(`${t.name} aberta`);
    },
    onError: (e: Error) => toast.error(e.message),
  });



  const addItem = useMutation({
    mutationFn: async (productId: string) => {
      const p = products.find((x) => x.id === productId)!;
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("tab_items").insert({
        user_id: auth.user!.id,
        store_id: currentStoreId(),
        tab_id: selected!,
        product_id: p.id,
        name: p.name,
        quantity: 1,
        unit_price_cents: p.price_cents,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const setWaiter = useMutation({
    mutationFn: async ({
      tabId,
      employeeId,
    }: {
      tabId: string;
      employeeId: string | null;
    }) => {
      const { error } = await supabase
        .from("tabs")
        .update({ employee_id: employeeId })
        .eq("id", tabId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tabs"] });
      toast.success("Garçom atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tab_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const closeTab = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (totalCents <= 0) throw new Error("Comanda sem itens lançados");
      const { data: register, error: regErr } = await supabase
        .from("cash_registers")
        .select("id, name")
        .eq("store_id", currentStoreId())
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (regErr) throw regErr;
      if (!register)
        throw new Error(
          "Nenhum caixa aberto. Abra o caixa para receber o pagamento.",
        );
      const { error: payErr } = await supabase.from("payments").insert({
        user_id: auth.user!.id,
        store_id: currentStoreId(),
        tab_id: selected!,
        method,
        amount_cents: totalCents,
        register_id: register.id,
      });
      if (payErr) throw payErr;

      // Baixa de estoque no fechamento (explode combos/kits/compostos)
      const stockAfter = await baixarEstoqueDoPedido({
        items,
        tabId: selected!,
        userId: auth.user!.id,
      });


      const { error } = await supabase
        .from("tabs")
        .update({ status: "closed", closed_at: new Date().toISOString() })
        .eq("id", selected!);
      if (error) throw error;
      return stockAfter;
    },
    onSuccess: (stockAfter) => {
      setLastStock(stockAfter ?? []);
      setLastClose({
        name: current?.name ?? "",
        total: totalCents,
        received: isCash && receivedCents > 0 ? receivedCents : totalCents,
        change: changeCents,
        method,
      });
      setReceived("");
      invalidate();
      toast.success(
        changeCents > 0
          ? `Comanda fechada · ${brl(totalCents)} no caixa · troco ${brl(changeCents)}`
          : `Comanda fechada · ${brl(totalCents)} lançado no caixa`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const open = tabs.filter((t) => t.status === "open");
  const closed = tabs.filter((t) => t.status === "closed");

  const detailCard = (
          <div className="card-surface p-5">
            {!current ? (
              <p className="py-24 text-center text-sm text-muted-foreground">
                Selecione uma comanda para lançar itens
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-lg font-black uppercase">{current.name}</h3>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                    {current.status === "open" ? "aberta" : "fechada"}
                  </span>
                  <span className="ml-auto text-xl font-black">{brl(totalCents)}</span>
                </div>

                {current.status === "open" && (
                  <div className="mt-5">
                    <Label className="mb-2 block">
                      Lançar produto{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        (estoque atual · baixa no fechamento)
                      </span>
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {products.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          Cadastre produtos em Cadastro para lançar na comanda.
                        </p>
                      )}
                      {products.map((p) => {
                        const naComanda = reservedByProduct[p.id] ?? 0;
                        const atual = Number(p.stock_qty);
                        const restante = atual - naComanda;
                        const semEstoque = p.track_stock && restante <= 0;
                        return (
                          <button
                            key={p.id}
                            onClick={() => addItem.mutate(p.id)}
                            disabled={semEstoque}
                            className="rounded-xl border border-border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <span className="block font-semibold">{p.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {brl(Number(p.price_cents))}
                            </span>
                            {p.track_stock && (
                              <span
                                className={`mt-0.5 block text-[11px] font-semibold ${
                                  restante <= 0
                                    ? "text-destructive"
                                    : restante <= Number(p.min_stock)
                                      ? "text-chart-3"
                                      : "text-muted-foreground"
                                }`}
                              >
                                Estoque {atual}
                                {naComanda > 0 ? ` · restam ${restante}` : ""}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="mt-6 w-56 space-y-2">
                  <Label>Garçom responsável</Label>
                  <Select
                    value={current.employee_id ?? "none"}
                    onValueChange={(v) =>
                      setWaiter.mutate({ tabId: current.id, employeeId: v === "none" ? null : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sem garçom" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem garçom</SelectItem>
                      {employees.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.name}
                          {Number(e.commission_pct ?? 0) > 0
                            ? ` · ${Number(e.commission_pct)}%`
                            : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="mt-6">
                  <Label className="mb-2 block">Itens</Label>
                  {items.length === 0 ? (
                    <p className="py-6 text-sm text-muted-foreground">Nenhum item lançado.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {items.map((i) => (
                        <li key={i.id} className="flex items-center gap-3 py-2.5">
                          <span className="text-sm font-semibold">
                            {Number(i.quantity)}x {i.name}
                          </span>
                          <span className="ml-auto text-sm font-bold">
                            {brl(Number(i.unit_price_cents) * Number(i.quantity))}
                          </span>
                          {current.status === "open" && (
                            <button
                              onClick={() => removeItem.mutate(i.id)}
                              className="text-muted-foreground transition-colors hover:text-destructive"
                              aria-label="Remover item"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {current.status === "open" && (
                  <div className="mt-6 space-y-4 border-t border-border pt-5">
                    <div
                      className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                        openRegister
                          ? "bg-chart-2/12 text-chart-2"
                          : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {openRegister
                        ? `Caixa aberto: ${openRegister.name} — o pagamento entra neste caixa e no relatório por dia`
                        : "Nenhum caixa aberto. Abra o caixa para receber o pagamento desta mesa."}
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="w-48 space-y-2">
                        <Label>Forma de pagamento</Label>
                        <Select
                          value={method}
                          onValueChange={(v) => setMethod(v as PaymentMethod)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PAYMENT_METHODS.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {isCash && (
                        <div className="w-44 space-y-2">
                          <Label>Valor recebido</Label>
                          <Input
                            inputMode="numeric"
                            value={received ? brl(receivedCents) : ""}
                            onChange={(e) => setReceived(e.target.value)}
                            placeholder="R$ 0,00"
                          />
                        </div>
                      )}
                      <Button
                        disabled={
                          items.length === 0 ||
                          !openRegister ||
                          closeTab.isPending ||
                          (isCash && receivedCents > 0 && missingCents > 0)
                        }
                        onClick={() => closeTab.mutate()}
                      >
                        <CheckCircle2 className="size-4" /> Fechar comanda
                      </Button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <MiniStat label="Total da comanda" value={brl(totalCents)} />
                      <MiniStat
                        label="Recebido"
                        value={brl(isCash ? receivedCents : totalCents)}
                      />
                      <MiniStat
                        label={missingCents > 0 ? "Falta receber" : "Troco"}
                        value={brl(missingCents > 0 ? missingCents : changeCents)}
                        tone={
                          missingCents > 0
                            ? "text-destructive"
                            : changeCents > 0
                              ? "text-chart-2"
                              : undefined
                        }
                      />
                    </div>
                  </div>
                )}

                <CaixaAoVivo
                  pending={{
                    total: totalCents,
                    change: changeCents,
                    isOpen: current.status === "open",
                  }}
                  lastClose={lastClose}
                  lastStock={lastStock}
                />
              </>
            )}
          </div>
  );

  const novaComanda = (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> Nova comanda
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Abrir comanda</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Identificação</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="MESA 12"
            />
          </div>
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={newKind} onValueChange={setNewKind}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TAB_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="w-full"
            disabled={!newName.trim() || createTab.isPending}
            onClick={() => createTab.mutate()}
          >
            Abrir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  const mesas = Array.from({ length: mesaCount }, (_, idx) => {
    const label = `MESA ${idx + 1}`;
    const tab = open.find(
      (t) => t.kind === "mesa" && t.name.trim().toUpperCase() === label,
    );
    return { label, tab };
  });

  const mesasFiltradas = mesas.filter((m) =>
    mesaFilter === "ocupadas" ? !!m.tab : mesaFilter === "livres" ? !m.tab : true,
  );

  const mapaCard = (
    <div className="card-surface p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <LayoutGrid className="size-4 text-primary" />
        <h3 className="font-bold">Mapa de mesas</h3>
        <span className="text-xs text-muted-foreground">
          {mesas.filter((m) => m.tab).length} ocupadas de {mesaCount}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="icon"
            variant="outline"
            onClick={() => changeMesaCount(mesaCount - 1)}
            aria-label="Menos mesas"
          >
            <Minus className="size-4" />
          </Button>
          <span className="w-8 text-center text-sm font-bold">{mesaCount}</span>
          <Button
            size="icon"
            variant="outline"
            onClick={() => changeMesaCount(mesaCount + 1)}
            aria-label="Mais mesas"
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {([
          { id: "todas", label: `Todas (${mesas.length})` },
          {
            id: "ocupadas",
            label: `Em atendimento (${mesas.filter((m) => m.tab).length})`,
          },
          {
            id: "livres",
            label: `Livres (${mesas.filter((m) => !m.tab).length})`,
          },
        ] as const).map((f) => (
          <button
            key={f.id}
            onClick={() => setMesaFilter(f.id)}
            className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
              mesaFilter === f.id
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">

        {mesasFiltradas.map((m) => {
          const occupied = !!m.tab;
          const total = m.tab ? (openTotals[m.tab.id] ?? 0) : 0;
          const isSelected = m.tab && m.tab.id === selected;
          return (
            <button
              key={m.label}
              onClick={() =>
                m.tab ? openEditor(m.tab.id) : openMesa.mutate(m.label)
              }
              className={`rounded-2xl border p-3 text-left transition-all hover:-translate-y-0.5 ${
                isSelected
                  ? "border-primary bg-primary-soft"
                  : occupied
                    ? "border-chart-2/40 bg-chart-2/10"
                    : "border-dashed border-border bg-muted/30"
              }`}
            >
              <p className="text-sm font-black uppercase">{m.label}</p>
              <p className="text-xs text-muted-foreground">
                {occupied ? "ocupada" : "livre"}
              </p>
              <p className="mt-2 text-base font-bold">
                {occupied ? brl(total) : "—"}
              </p>
            </button>
          );
        })}
      </div>

      {open.some((t) => t.kind !== "mesa") && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">
            Outras comandas abertas (balcão, delivery)
          </p>
          <div className="flex flex-wrap gap-2">
            {open
              .filter((t) => t.kind !== "mesa")
              .map((t) => (
                <button
                  key={t.id}
                  onClick={() => openEditor(t.id)}
                  className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                    selected === t.id
                      ? "border-primary bg-primary-soft"
                      : "border-border bg-card hover:bg-muted"
                  }`}
                >
                  <span className="block font-bold uppercase">{t.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {t.kind} · {brl(openTotals[t.id] ?? 0)}
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );

  const tabsBar = (
    <div className="flex gap-2 border-b border-border">
      {([
        { id: "mapa", label: "Mapa de mesas" },
        { id: "lista", label: "Comandas" },
        { id: "relatorio", label: "Relatório de vendas" },
      ] as const).map((t) => (
        <button
          key={t.id}
          onClick={() => setView(t.id)}
          className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            view === t.id
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      {embedded ? (
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-black">Comandas e mesas</h3>
          <div className="ml-auto">{novaComanda}</div>
        </div>
      ) : (
        <SectionTitle
          icon={Receipt}
          tone="bg-chart-5/12 text-chart-5"
          action={novaComanda}
        >
          Comandas
        </SectionTitle>
      )}

      {tabsBar}

      <PedidoEditor
        mode="mesa"
        tabId={editing}
        onClose={() => {
          setEditing(null);
          invalidate();
        }}
      />

      {view === "relatorio" ? (
        <RelatorioVendas />
      ) : view === "mapa" ? (
        <div className="space-y-4">
          {mapaCard}
          {detailCard}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="card-surface p-4">
              <h3 className="mb-3 font-bold">Abertas ({open.length})</h3>
              {open.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhuma comanda aberta
                </p>
              )}
              <ul className="space-y-1">
                {open.map((t) => (
                  <li key={t.id}>
                    <button
                      onClick={() => openEditor(t.id)}
                      className={`w-full rounded-xl px-3 py-2 text-left transition-colors ${
                        selected === t.id ? "bg-primary-soft" : "hover:bg-muted"
                      }`}
                    >
                      <p className="text-sm font-bold uppercase">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.kind} · {dateTime(t.opened_at)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="card-surface p-4">
              <h3 className="mb-3 font-bold">Fechadas ({closed.length})</h3>
              <ul className="space-y-1">
                {closed.slice(0, 10).map((t) => (
                  <li key={t.id} className="px-3 py-2">
                    <p className="text-sm font-bold uppercase">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Fechada {dateTime(t.closed_at)}
                    </p>
                  </li>
                ))}
                {closed.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Nada por aqui ainda
                  </p>
                )}
              </ul>
            </div>
          </div>

          {detailCard}
        </div>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string | undefined;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-black ${tone ?? ""}`}>{value}</p>
    </div>
  );
}

function CaixaAoVivo({
  pending,
  lastClose,
  lastStock = [],
}: {
  pending: { total: number; change: number; isOpen: boolean };
  lastClose: {
    name: string;
    total: number;
    received: number;
    change: number;
    method: PaymentMethod;
  } | null;
  lastStock?: { name: string; qty: number }[];
}) {
  const qc = useQueryClient();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const since = startOfDay.toISOString();

  const { data: today } = useQuery({
    queryKey: ["caixa_ao_vivo", since],
    refetchInterval: 10000,
    queryFn: async () => {
      const [pay, mov] = await Promise.all([
        supabase
          .from("payments")
          .select("amount_cents, method, paid_at")
        .eq("store_id", currentStoreId())
          .gte("paid_at", since),
        supabase
          .from("cash_movements")
          .select("amount_cents, kind, created_at")
        .eq("store_id", currentStoreId())
          .gte("created_at", since),
      ]);
      if (pay.error) throw pay.error;
      if (mov.error) throw mov.error;
      const vendas = (pay.data ?? []).reduce(
        (s, p) => s + Number(p.amount_cents),
        0,
      );
      const dinheiro = (pay.data ?? [])
        .filter((p) => p.method === "dinheiro")
        .reduce((s, p) => s + Number(p.amount_cents), 0);
      const entradas = (mov.data ?? [])
        .filter((m) => m.kind === "entrada")
        .reduce((s, m) => s + Number(m.amount_cents), 0);
      const saidas = (mov.data ?? [])
        .filter((m) => m.kind !== "entrada")
        .reduce((s, m) => s + Number(m.amount_cents), 0);
      return {
        vendas,
        dinheiro,
        entradas,
        saidas,
        saldo: vendas + entradas - saidas,
        count: (pay.data ?? []).length,
      };
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("comandas-caixa-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments" },
        () => qc.invalidateQueries({ queryKey: ["caixa_ao_vivo"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cash_movements" },
        () => qc.invalidateQueries({ queryKey: ["caixa_ao_vivo"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  return (
    <div className="mt-6 rounded-2xl border border-border bg-muted/30 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Wallet className="size-4 text-primary" />
        <h4 className="text-sm font-bold">Relatório de caixa em tempo real</h4>
        <span className="ml-auto text-xs text-muted-foreground">
          hoje · {today?.count ?? 0} pagamentos
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Vendas do dia" value={brl(today?.vendas ?? 0)} />
        <MiniStat label="Em dinheiro" value={brl(today?.dinheiro ?? 0)} />
        <MiniStat label="Suprimentos" value={brl(today?.entradas ?? 0)} />
        <MiniStat label="Sangrias" value={brl(today?.saidas ?? 0)} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <MiniStat label="Saldo do dia" value={brl(today?.saldo ?? 0)} />
        {pending.isOpen ? (
          <MiniStat
            label="Esta comanda (prévia) · troco"
            value={`${brl(pending.total)} · ${brl(pending.change)}`}
            tone={pending.change > 0 ? "text-chart-2" : undefined}
          />
        ) : (
          <MiniStat label="Comanda fechada" value={brl(pending.total)} />
        )}
      </div>

      {lastClose && (
        <p className="mt-3 rounded-xl bg-card px-3 py-2 text-xs text-muted-foreground">
          Último fechamento · <strong className="uppercase">{lastClose.name}</strong>{" "}
          — total {brl(lastClose.total)}, recebido {brl(lastClose.received)}, troco{" "}
          <strong className="text-foreground">{brl(lastClose.change)}</strong> (
          {lastClose.method})
        </p>
      )}

      {lastStock.length > 0 && (
        <p className="mt-2 rounded-xl bg-card px-3 py-2 text-xs text-muted-foreground">
          Estoque atualizado:{" "}
          {lastStock.map((s, idx) => (
            <span key={s.name}>
              {idx > 0 ? " · " : ""}
              <strong className="text-foreground">{s.name}</strong> = {s.qty}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
