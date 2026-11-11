import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import {
  Banknote,
  ArrowDownCircle,
  ArrowUpCircle,
  Unlock,
  Bike,
  LayoutGrid,
  Settings,
  Eye,
  Lock,
  Printer,
  BarChart3,
  QrCode,
  Users,
  Package,
  History,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { BiVendas } from "@/features/bi-vendas";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId } from "@/lib/store";
import { brl, dateTime } from "@/lib/format";
import { PAYMENT_METHODS, methodLabel, type PaymentMethod } from "@/lib/smartpag";
import { ComandasModule } from "@/features/comandas";
import { PedidosBalcaoDelivery } from "@/features/pdv-pedidos";
import { HistoricoPedidos } from "@/features/pdv-historico";
import { ClosuresAudit } from "@/features/fechamento-caixa";
import { CaixaScreen } from "@/features/caixa-pdv";
import { RelatorioVendas } from "@/features/relatorios";
import { IconTile } from "@/components/AppShell";

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

export const Route = createFileRoute("/_authenticated/pdv")({
  head: () => ({
    meta: [
      { title: "PDV — SmartPag" },
      {
        name: "description",
        content:
          "PDV completo: mapa de mesas, comandas, abertura e fechamento de caixa, entradas, saídas e relatórios.",
      },
      { property: "og:title", content: "PDV — SmartPag" },
      {
        property: "og:description",
        content: "Vendas no PDV, comandas, sangrias, suprimentos e conferência do caixa.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pdv,
});

const toCents = (v: string) => Math.round(Number(v.replace(",", ".") || 0) * 100);

function Pdv() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<
    "pedidos" | "mesa" | "historico" | "fluxo" | "bi" | "config"
  >(
    "pedidos",
  );
  const [fluxoView, setFluxoView] = useState<
    "visualizar" | "lancamento" | "vendas" | "encerrar" | null
  >(null);

  const [openingValue, setOpeningValue] = useState("0");
  const [movKind, setMovKind] = useState<"entrada" | "saida">("saida");
  const [movDesc, setMovDesc] = useState("");
  const [movValue, setMovValue] = useState("");
  const [movMethod, setMovMethod] = useState<PaymentMethod>("dinheiro");
  

  const { data: registers = [] } = useQuery({
    queryKey: ["cash_registers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_registers")
        .select("*")
        .eq("store_id", currentStoreId())
        .order("opened_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
  });

  const current = registers.find((r) => r.status === "open") ?? null;
  const history = registers.filter((r) => r.status === "closed");

  const { data: movements = [] } = useQuery({
    queryKey: ["cash_movements", current?.id],
    enabled: !!current,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_movements")
        .select("*")
        .eq("store_id", currentStoreId())
        .eq("register_id", current!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["payments", "register", current?.id],
    enabled: !!current,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("store_id", currentStoreId())
        .eq("register_id", current!.id)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const salesTotal = payments.reduce((s, p) => s + Number(p.amount_cents), 0);
  const salesCash = payments
    .filter((p) => p.method === "dinheiro")
    .reduce((s, p) => s + Number(p.amount_cents), 0);
  const inflow = movements
    .filter((m) => m.kind === "entrada")
    .reduce((s, m) => s + Number(m.amount_cents), 0);
  const outflow = movements
    .filter((m) => m.kind === "saida")
    .reduce((s, m) => s + Number(m.amount_cents), 0);
  const cashInflow = movements
    .filter((m) => m.kind === "entrada" && m.method === "dinheiro")
    .reduce((s, m) => s + Number(m.amount_cents), 0);
  const cashOutflow = movements
    .filter((m) => m.kind === "saida" && m.method === "dinheiro")
    .reduce((s, m) => s + Number(m.amount_cents), 0);

  const opening = Number(current?.opening_cents ?? 0);
  const expectedCash = opening + salesCash + cashInflow - cashOutflow;
  const result = salesTotal + inflow - outflow;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["cash_registers"] });
    qc.invalidateQueries({ queryKey: ["cash_movements"] });
    qc.invalidateQueries({ queryKey: ["payments"] });
  };

  useEffect(() => {
    const channel = supabase
      .channel("caixa-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_movements" }, () => {
        qc.invalidateQueries({ queryKey: ["cash_movements"] });
        qc.invalidateQueries({ queryKey: ["cash_report"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => {
        qc.invalidateQueries({ queryKey: ["payments"] });
        qc.invalidateQueries({ queryKey: ["cash_report"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_registers" }, () => {
        qc.invalidateQueries({ queryKey: ["cash_registers"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const openRegister = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("cash_registers").insert({
        user_id: auth.user!.id,
        store_id: currentStoreId(),
        opening_cents: toCents(openingValue),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setOpeningValue("0");
      invalidate();
      toast.success("Caixa aberto");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addMovement = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("cash_movements").insert({
        user_id: auth.user!.id,
        store_id: currentStoreId(),
        register_id: current!.id,
        kind: movKind,
        description: movDesc.trim(),
        amount_cents: toCents(movValue),
        method: movMethod,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setMovDesc("");
      setMovValue("");
      invalidate();
      toast.success("Movimento registrado");
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const sections = [
    { id: "pedidos", label: "Delivery – Balcão", icon: Bike },
    { id: "mesa", label: "Mesa", icon: LayoutGrid },
    { id: "historico", label: "Histórico de Pedidos", icon: History },
    { id: "fluxo", label: "Fluxo Caixa", icon: Banknote },
    { id: "bi", label: "BI & Relatórios", icon: BarChart3 },
    { id: "config", label: "Configuração", icon: Settings },
  ] as const;

  const fluxoCards = [
    {
      id: "visualizar",
      label: "Visualizar",
      desc: "Relatório do dia",
      icon: Eye,
      tone: "bg-chart-1/12 text-chart-1",
    },
    {
      id: "lancamento",
      label: "Lançamento",
      desc: "Entradas e saídas",
      icon: ArrowUpCircle,
      tone: "bg-chart-3/15 text-chart-3",
    },
    {
      id: "vendas",
      label: "Vendas",
      desc: "Relatório de vendas",
      icon: BarChart3,
      tone: "bg-chart-5/12 text-chart-5",
    },
    {
      id: "encerrar",
      label: "Encerrar",
      desc: "Conferência e fechamento",
      icon: Lock,
      tone: "bg-destructive/10 text-destructive",
    },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl bg-foreground text-background">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:flex sm:flex-wrap">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-background/15">
              <Banknote className="size-4" />
            </span>
            <h1 className="truncate text-lg font-black">PDV</h1>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-black uppercase ${
              current ? "bg-chart-2 text-background" : "bg-background/20"
            }`}
          >
            Caixa {current ? "aberto" : "fechado"}
          </span>
          <span className="hidden text-xs text-background/70 sm:block sm:ml-auto">
            {dateTime(new Date().toISOString())}
          </span>
        </div>
        <div className="flex gap-1 overflow-x-auto border-t border-background/15 px-2 py-2">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setTab(s.id)}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
                tab === s.id
                  ? "bg-background text-foreground"
                  : "text-background/70 hover:bg-background/10"
              }`}
            >
              <s.icon className="size-4" />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {!current && <OpenDayCard value={openingValue} onChange={setOpeningValue} onOpen={() => openRegister.mutate()} pending={openRegister.isPending} last={history[0] ?? null} />}

      {tab === "pedidos" ? (
        <PedidosBalcaoDelivery />
      ) : tab === "mesa" ? (
        <ComandasModule embedded />
      ) : tab === "historico" ? (
        <HistoricoPedidos />
      ) : tab === "bi" ? (
        <BiVendas />
      ) : tab === "config" ? (
        <PdvConfig />
      ) : fluxoView === null ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {fluxoCards.map((c) => (
              <button
                key={c.id}
                onClick={() => setFluxoView(c.id)}
                className="card-surface flex items-center gap-3 p-5 text-left transition-transform hover:-translate-y-0.5"
              >
                <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${c.tone}`}>
                  <c.icon className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-black">{c.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {c.desc}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <ClosuresAudit />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setFluxoView(null)}>
              Voltar ao fluxo de caixa
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="size-4" /> Imprimir
            </Button>
          </div>
          {fluxoView === "visualizar" ? (
            <DailyCashReport />
          ) : fluxoView === "vendas" ? (
            <SalesCaixaReport />
          ) : fluxoView === "encerrar" ? (
            current ? (
              <CaixaScreen
                register={current}
                payments={payments}
                movements={movements}
                expectedCash={expectedCash}
                onDone={() => {
                  invalidate();
                  qc.invalidateQueries({ queryKey: ["cash_closures"] });
                }}
              />
            ) : (
              <p className="card-surface p-10 text-center text-sm text-muted-foreground">
                Abra o caixa acima para iniciar o dia e liberar o fechamento.
              </p>
            )
          ) : !current ? (
            <p className="card-surface p-10 text-center text-sm text-muted-foreground">
              Abra o caixa acima para iniciar o dia e liberar a operação.
            </p>
          ) : (

        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Abertura", value: opening, tone: "bg-muted text-foreground" },
              { label: "Vendas no caixa", value: salesTotal, tone: "bg-chart-1/12 text-chart-1" },
              { label: "Entradas / Saídas", value: inflow - outflow, tone: "bg-chart-3/15 text-chart-3" },
              { label: "Dinheiro esperado", value: expectedCash, tone: "bg-chart-2/12 text-chart-2" },
            ].map((c) => (
              <div key={c.label} className="card-surface p-5">
                <p className="text-xs font-semibold text-muted-foreground">{c.label}</p>
                <p className="mt-1 text-2xl font-black">{brl(c.value)}</p>
                <span className={`mt-3 inline-block h-1.5 w-10 rounded-full ${c.tone}`} />
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
            <div className="space-y-4">
              <div className="card-surface space-y-4 p-5">
                <h3 className="font-bold">Registrar movimento</h3>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select
                    value={movKind}
                    onValueChange={(v) => setMovKind(v as "entrada" | "saida")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="entrada">Entrada (suprimento)</SelectItem>
                      <SelectItem value="saida">Saída (sangria)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Input
                    value={movDesc}
                    onChange={(e) => setMovDesc(e.target.value)}
                    placeholder="Troco, pagamento de fornecedor..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Valor (R$)</Label>
                    <Input
                      inputMode="decimal"
                      value={movValue}
                      onChange={(e) => setMovValue(e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Forma</Label>
                    <Select
                      value={movMethod}
                      onValueChange={(v) => setMovMethod(v as PaymentMethod)}
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
                </div>
                <Button
                  className="w-full"
                  disabled={!movDesc.trim() || toCents(movValue) <= 0 || addMovement.isPending}
                  onClick={() => addMovement.mutate()}
                >
                  Registrar
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="card-surface">
                <div className="flex items-center justify-between border-b border-border px-5 py-3">
                  <h3 className="font-bold">Relatório do caixa</h3>
                  <span className="text-xs text-muted-foreground">
                    Aberto em {dateTime(current.opened_at)}
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {PAYMENT_METHODS.map((m) => {
                    const value = payments
                      .filter((p) => p.method === m.id)
                      .reduce((s, p) => s + Number(p.amount_cents), 0);
                    return (
                      <div key={m.id} className="flex items-center gap-3 px-5 py-2.5">
                        <span className={`size-7 rounded-lg ${m.tone}`} />
                        <span className="text-sm font-semibold">{methodLabel(m.id)}</span>
                        <span className="ml-auto text-sm font-bold">{brl(value)}</span>
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-3 px-5 py-3">
                    <span className="text-sm font-bold">Resultado do turno</span>
                    <span className="ml-auto text-base font-black">{brl(result)}</span>
                  </div>
                </div>
              </div>

              <div className="card-surface">
                <h3 className="border-b border-border px-5 py-3 font-bold">
                  Entradas e saídas ({movements.length})
                </h3>
                <div className="divide-y divide-border">
                  {movements.length === 0 && (
                    <p className="p-10 text-center text-sm text-muted-foreground">
                      Nenhum movimento registrado neste caixa.
                    </p>
                  )}
                  {movements.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 px-5 py-3">
                      <IconTile
                        icon={m.kind === "entrada" ? ArrowDownCircle : ArrowUpCircle}
                        tone={
                          m.kind === "entrada"
                            ? "bg-chart-2/12 text-chart-2"
                            : "bg-destructive/10 text-destructive"
                        }
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{m.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {methodLabel(m.method)} · {dateTime(m.created_at)}
                        </p>
                      </div>
                      <span
                        className={`ml-auto text-sm font-bold ${
                          m.kind === "entrada" ? "text-chart-2" : "text-destructive"
                        }`}
                      >
                        {m.kind === "entrada" ? "+" : "-"}
                        {brl(Number(m.amount_cents))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
          )}
        </div>
      )}

      <div className={`card-surface ${fluxoView !== "lancamento" ? "hidden" : ""}`}>

        <h3 className="border-b border-border px-5 py-3 font-bold">Caixas fechados</h3>
        <div className="divide-y divide-border">
          {history.length === 0 && (
            <p className="p-10 text-center text-sm text-muted-foreground">
              Nenhum caixa fechado ainda.
            </p>
          )}
          {history.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div>
                <p className="text-sm font-semibold">{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  {dateTime(r.opened_at)} → {dateTime(r.closed_at)}
                </p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-xs text-muted-foreground">Abertura {brl(Number(r.opening_cents))}</p>
                <p className="text-sm font-bold">
                  Fechamento {brl(Number(r.closing_counted_cents ?? 0))}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
};

const dayLabel = (key: string) => {
  const [, m, d] = key.split("-");
  return `${d}/${m}`;
};

const shortDate = (key: string) => {
  const [y, m, d] = key.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("pt-BR", {
    weekday: "short",
  });
};

function DailyCashReport() {
  const qc = useQueryClient();
  const [days, setDays] = useState("30");
  const since = new Date(
    Date.now() - (Number(days) - 1) * 86400000,
  );
  since.setHours(0, 0, 0, 0);
  const sinceISO = since.toISOString();

  const { data: movements = [] } = useQuery({
    queryKey: ["cash_report", "movements", days],
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_movements")
        .select("*")
        .eq("store_id", currentStoreId())
        .gte("created_at", sinceISO)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["cash_report", "payments", days],
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("store_id", currentStoreId())
        .gte("paid_at", sinceISO)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Contas/provisões baixadas no período entram como saída do caixa do dia.
  const { data: expenses = [] } = useQuery({
    queryKey: ["cash_report", "expenses", days],
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("store_id", currentStoreId())
        .eq("paid", true)
        .not("paid_at", "is", null)
        .gte("paid_at", sinceISO)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Caixa aberto: base para o saldo atual (fundo de troco + movimento do turno).
  const { data: openRegister = null } = useQuery({
    queryKey: ["cash_report", "open_register"],
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_registers")
        .select("*")
        .eq("store_id", currentStoreId())
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const refresh = () => qc.invalidateQueries({ queryKey: ["cash_report"] });
    const ch = supabase
      .channel("painel-caixa-dia")
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_movements" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_registers" }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const map = new Map<
    string,
    { key: string; entradas: number; saidas: number; vendas: number; contas: number }
  >();
  const ensure = (key: string) => {
    if (!map.has(key)) map.set(key, { key, entradas: 0, saidas: 0, vendas: 0, contas: 0 });
    return map.get(key)!;
  };
  for (const p of payments) {
    const row = ensure(dayKey(p.paid_at));
    row.vendas += Number(p.amount_cents);
    row.entradas += Number(p.amount_cents);
  }
  for (const m of movements) {
    const row = ensure(dayKey(m.created_at));
    if (m.kind === "entrada") row.entradas += Number(m.amount_cents);
    else row.saidas += Number(m.amount_cents);
  }
  for (const e of expenses) {
    const row = ensure(dayKey(e.paid_at as string));
    row.saidas += Number(e.amount_cents);
    row.contas += Number(e.amount_cents);
  }

  const rows = [...map.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
  const chart = [...rows]
    .reverse()
    .map((r) => ({
      dia: dayLabel(r.key),
      entradas: r.entradas / 100,
      saidas: r.saidas / 100,
      saldo: (r.entradas - r.saidas) / 100,
    }));

  const totalIn = rows.reduce((s, r) => s + r.entradas, 0);
  const totalOut = rows.reduce((s, r) => s + r.saidas, 0);

  const todayKey = dayKey(new Date().toISOString());
  const today = rows.find((r) => r.key === todayKey);

  // Saldo atual do caixa aberto: abertura + tudo que entrou - tudo que saiu no turno.
  const openedAt = openRegister?.opened_at ?? null;
  const inTurn = (iso: string) => !!openedAt && new Date(iso) >= new Date(openedAt);
  const turnoVendas = payments
    .filter((p) => inTurn(p.paid_at))
    .reduce((s, p) => s + Number(p.amount_cents), 0);
  const turnoEntradas = movements
    .filter((m) => m.kind === "entrada" && inTurn(m.created_at))
    .reduce((s, m) => s + Number(m.amount_cents), 0);
  const turnoSaidas = movements
    .filter((m) => m.kind === "saida" && inTurn(m.created_at))
    .reduce((s, m) => s + Number(m.amount_cents), 0);
  const turnoContas = expenses
    .filter((e) => inTurn(e.paid_at as string))
    .reduce((s, e) => s + Number(e.amount_cents), 0);
  const saldoAtual = openRegister
    ? Number(openRegister.opening_cents) + turnoVendas + turnoEntradas - turnoSaidas - turnoContas
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-44">
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
        <span className="text-xs font-semibold text-muted-foreground">
          Atualiza sozinho com pedidos, sangrias e baixas de contas
        </span>
      </div>

      <div className="card-surface flex flex-wrap items-center gap-6 p-5">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Saldo atual do caixa</p>
          <p className="mt-1 text-3xl font-black">{brl(saldoAtual)}</p>
          <p className="text-xs text-muted-foreground">
            {openRegister
              ? `Caixa aberto em ${dateTime(openRegister.opened_at)} • fundo ${brl(Number(openRegister.opening_cents))}`
              : "Nenhum caixa aberto no momento"}
          </p>
        </div>
        {openRegister && (
          <div className="ml-auto grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Vendas do turno", value: turnoVendas },
              { label: "Suprimentos", value: turnoEntradas },
              { label: "Sangrias", value: -turnoSaidas },
              { label: "Contas pagas", value: -turnoContas },
            ].map((c) => (
              <div key={c.label}>
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="text-sm font-bold">{brl(c.value)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Entradas no período", value: totalIn, tone: "bg-chart-2/12 text-chart-2" },
          { label: "Saídas no período", value: totalOut, tone: "bg-destructive/12 text-destructive" },
          { label: "Saldo do período", value: totalIn - totalOut, tone: "bg-chart-1/12 text-chart-1" },
          {
            label: "Saldo de hoje",
            value: today ? today.entradas - today.saidas : 0,
            tone: "bg-chart-3/15 text-chart-3",
          },
        ].map((c) => (
          <div key={c.label} className="card-surface p-5">
            <p className="text-xs font-semibold text-muted-foreground">{c.label}</p>
            <p className="mt-1 text-2xl font-black">{brl(c.value)}</p>
            <span className={`mt-3 inline-block h-1.5 w-10 rounded-full ${c.tone}`} />
          </div>
        ))}
      </div>

      <div className="card-surface p-5">
        <h3 className="mb-4 font-bold">Entradas x saídas por dia</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="dia"
                tickLine={false}
                axisLine={false}
                fontSize={12}
                interval="preserveStartEnd"
              />
              <YAxis tickLine={false} axisLine={false} fontSize={12} width={52} />
              <Tooltip
                formatter={(v: number) => brl(Math.round(v * 100))}
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                }}
              />
              <Legend />
              <Bar dataKey="entradas" name="Entradas" fill="var(--chart-2)" radius={[8, 8, 0, 0]} />
              <Bar dataKey="saidas" name="Saídas" fill="var(--chart-4)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card-surface">
        <h3 className="border-b border-border px-5 py-3 font-bold">Resumo diário</h3>
        <div className="divide-y divide-border">
          {rows.length === 0 && (
            <p className="p-10 text-center text-sm text-muted-foreground">
              Nenhum movimento no período.
            </p>
          )}
          {rows.map((r) => (
            <div key={r.key} className="flex flex-wrap items-center gap-4 px-5 py-3">
              <div className="w-24">
                <p className="text-sm font-bold">{dayLabel(r.key)}</p>
                <p className="text-xs text-muted-foreground">{shortDate(r.key)}</p>
              </div>
              <div className="flex items-center gap-2">
                <IconTile icon={ArrowDownCircle} tone="bg-chart-2/12 text-chart-2" />
                <div>
                  <p className="text-xs text-muted-foreground">Entradas</p>
                  <p className="text-sm font-bold text-chart-2">{brl(r.entradas)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <IconTile icon={ArrowUpCircle} tone="bg-destructive/10 text-destructive" />
                <div>
                  <p className="text-xs text-muted-foreground">Saídas</p>
                  <p className="text-sm font-bold text-destructive">{brl(r.saidas)}</p>
                </div>
              </div>
              <div className="ml-auto text-right">
                <p className="text-xs text-muted-foreground">
                  Vendas {brl(r.vendas)} • Contas {brl(r.contas)}
                </p>
                <p className="text-base font-black">{brl(r.entradas - r.saidas)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


function SalesCaixaReport() {
  const [days, setDays] = useState("30");
  const since = new Date(Date.now() - (Number(days) - 1) * 86400000);
  since.setHours(0, 0, 0, 0);
  const sinceISO = since.toISOString();

  const { data: payments = [] } = useQuery({
    queryKey: ["cash_sales", "payments", days],
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("store_id", currentStoreId())
        .gte("paid_at", sinceISO);
      if (error) throw error;
      return data;
    },
  });

  const { data: tabs = [] } = useQuery({
    queryKey: ["cash_sales", "tabs", days],
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tabs")
        .select("*")
        .eq("store_id", currentStoreId())
        .gte("opened_at", sinceISO);
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("caixa-vendas")
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => {})
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const total = payments.reduce((s, p) => s + Number(p.amount_cents), 0);
  const totalComandas = tabs.length;
  const mesas = tabs.filter((t) => t.kind === "mesa");
  const mesaIds = new Set(mesas.map((t) => t.id));
  const totalMesas = payments
    .filter((p) => p.tab_id && mesaIds.has(p.tab_id))
    .reduce((s, p) => s + Number(p.amount_cents), 0);
  const ticketMesa = mesas.length ? Math.round(totalMesas / mesas.length) : 0;
  const ticketComanda = totalComandas ? Math.round(total / totalComandas) : 0;

  const hours = Array.from({ length: 24 }, (_, h) => ({
    hora: `${String(h).padStart(2, "0")}h`,
    valor: 0,
    comandas: 0,
  }));
  for (const p of payments) {
    const h = new Date(p.paid_at).getHours();
    const slot = hours[h]!;
    slot.valor += Number(p.amount_cents) / 100;
    slot.comandas += 1;
  }
  const peak = hours.reduce((a, b) => (b.valor > a.valor ? b : a), hours[0]!);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold">Relatório de vendas do caixa</h3>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total vendido", value: brl(total), hint: `${payments.length} pagamento(s)` },
          { label: "Total de comandas", value: String(totalComandas), hint: `${mesas.length} mesa(s)` },
          { label: "Valor médio por mesa", value: brl(ticketMesa), hint: `Ticket geral ${brl(ticketComanda)}` },
          {
            label: "Horário de pico",
            value: peak.valor > 0 ? peak.hora : "—",
            hint: peak.valor > 0 ? `${brl(peak.valor * 100)} • ${peak.comandas} venda(s)` : "Sem vendas no período",
          },
        ].map((c) => (
          <div key={c.label} className="card-surface p-5">
            <p className="text-xs font-semibold text-muted-foreground">{c.label}</p>
            <p className="mt-1 text-2xl font-black">{c.value}</p>
            <p className="text-xs text-muted-foreground">{c.hint}</p>
          </div>
        ))}
      </div>

      <div className="card-surface p-5">
        <h3 className="mb-4 font-bold">Vendas por horário</h3>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hours}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="hora" tickLine={false} axisLine={false} fontSize={11} interval={1} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} width={48} />
              <Tooltip
                formatter={(v: number) => brl(v * 100)}
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                }}
              />
              <Bar dataKey="valor" fill="var(--chart-1)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <RelatorioVendas />
    </div>
  );
}

function OpenDayCard({
  value,
  onChange,
  onOpen,
  pending,
  last,
}: {
  value: string;
  onChange: (v: string) => void;
  onOpen: () => void;
  pending: boolean;
  last: { closing_counted_cents: number | null; closed_at: string | null } | null;
}) {
  return (
    <div className="card-surface grid gap-4 p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex items-start gap-3">
        <IconTile icon={Unlock} tone="bg-chart-2/12 text-chart-2" />
        <div className="space-y-1">
          <h3 className="text-lg font-bold">Iniciar o dia</h3>
          <p className="text-sm text-muted-foreground">
            Nenhum caixa aberto. Informe o fundo de troco para liberar vendas no PDV,
            comandas e recebimentos.
          </p>
          <p className="text-xs text-muted-foreground">
            {last
              ? `Último fechamento: ${brl(Number(last.closing_counted_cents ?? 0))} em ${dateTime(
                  last.closed_at ?? "",
                )}`
              : "Este será o primeiro caixa desta loja."}
          </p>
        </div>
      </div>
      <div className="space-y-3">
        <div className="space-y-2">
          <Label>Valor de abertura (R$)</Label>
          <Input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
        </div>
        <Button className="w-full" disabled={pending} onClick={onOpen}>
          Abrir caixa e iniciar o dia
        </Button>
      </div>
    </div>
  );
}

function PdvConfig() {
  const [autoAccept, setAutoAccept] = useState(
    () => localStorage.getItem("pdv_auto_accept") === "1",
  );
  const [sound, setSound] = useState(
    () => localStorage.getItem("pdv_sound") !== "0",
  );
  const [order, setOrder] = useState(
    () => localStorage.getItem("pdv_order") ?? "recentes",
  );

  const toggle = (key: string, value: boolean) =>
    localStorage.setItem(key, value ? "1" : "0");

  const links = [
    { to: "/cadastro", label: "Cadastros", desc: "Produtos, categorias, clientes", icon: Package },
    { to: "/equipe", label: "Equipe", desc: "Funcionários e comissões", icon: Users },
    { to: "/cardapio", label: "Cardápio e QR Code", desc: "Mesas e cardápio público", icon: QrCode },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card-surface space-y-4 p-5">
        <h3 className="font-bold">Básico</h3>
        <label className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3">
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Aceitar pedidos automaticamente</span>
            <span className="block text-xs text-muted-foreground">
              Novos pedidos entram direto na fila de produção
            </span>
          </span>
          <input
            type="checkbox"
            className="size-5 shrink-0 accent-[hsl(var(--primary))]"
            checked={autoAccept}
            onChange={(e) => {
              setAutoAccept(e.target.checked);
              toggle("pdv_auto_accept", e.target.checked);
            }}
          />
        </label>
        <label className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3">
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Som de novo pedido</span>
            <span className="block text-xs text-muted-foreground">
              Alerta sonoro ao chegar pedido na fila
            </span>
          </span>
          <input
            type="checkbox"
            className="size-5 shrink-0 accent-[hsl(var(--primary))]"
            checked={sound}
            onChange={(e) => {
              setSound(e.target.checked);
              localStorage.setItem("pdv_sound", e.target.checked ? "1" : "0");
            }}
          />
        </label>
        <div className="space-y-2">
          <Label>Ordenação dos pedidos</Label>
          <Select
            value={order}
            onValueChange={(v) => {
              setOrder(v);
              localStorage.setItem("pdv_order", v);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recentes">Mais recentes primeiro</SelectItem>
              <SelectItem value="antigos">Mais antigos primeiro</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="card-surface space-y-3 p-5">
        <h3 className="font-bold">Informações da operação</h3>
        {links.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 transition-colors hover:bg-muted"
          >
            <IconTile icon={l.icon} tone="bg-primary-soft text-primary" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{l.label}</span>
              <span className="block truncate text-xs text-muted-foreground">{l.desc}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
