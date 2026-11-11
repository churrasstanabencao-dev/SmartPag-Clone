import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  CheckCircle2,
  CircleDollarSign,
  Receipt,
  ShoppingBag,
  Store as StoreIcon,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store";
import { brl, dateTime, shortDate } from "@/lib/format";
import { PAYMENT_METHODS } from "@/lib/smartpag";
import { IconTile, SectionTitle } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard da loja — SmartPag" },
      {
        name: "description",
        content:
          "Painel por loja com estoque, comandas, caixa, contas a pagar e gráficos de vendas e ticket médio.",
      },
      { property: "og:title", content: "Dashboard da loja — SmartPag" },
      {
        property: "og:description",
        content:
          "Estoque, comandas, caixa e contas a pagar de cada loja, com gráficos de vendas e ticket médio.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const PERIODS = [
  { id: 7, label: "7 dias" },
  { id: 15, label: "15 dias" },
  { id: 30, label: "30 dias" },
] as const;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayKey(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

function Dashboard() {
  const { storeId, stores, store } = useStore();
  const [selected, setSelected] = useState<string | null>(null);
  const [days, setDays] = useState<number>(7);

  const activeId = selected ?? storeId;
  const activeStore = stores.find((s) => s.id === activeId) ?? store;

  const since = useMemo(() => {
    const d = startOfDay(new Date());
    d.setDate(d.getDate() - (days - 1));
    return d.toISOString();
  }, [days]);

  const todayISO = useMemo(() => startOfDay(new Date()).toISOString(), []);
  const enabled = !!activeId;

  const { data: payments = [] } = useQuery({
    queryKey: ["dash", "payments", activeId, since],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, amount_cents, method, paid_at, tab_id")
        .eq("store_id", activeId!)
        .gte("paid_at", since)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: tabs = [] } = useQuery({
    queryKey: ["dash", "tabs", activeId, since],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tabs")
        .select("id, name, kind, status, opened_at, closed_at")
        .eq("store_id", activeId!)
        .order("opened_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["dash", "products", activeId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, stock_qty, min_stock, cost_cents, track_stock, active")
        .eq("store_id", activeId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: registers = [] } = useQuery({
    queryKey: ["dash", "registers", activeId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_registers")
        .select("*")
        .eq("store_id", activeId!)
        .order("opened_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  const openRegister = registers.find((r) => r.status === "open") ?? null;

  const { data: movements = [] } = useQuery({
    queryKey: ["dash", "cash-movements", openRegister?.id],
    enabled: !!openRegister,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_movements")
        .select("kind, amount_cents, method")
        .eq("register_id", openRegister!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: registerPayments = [] } = useQuery({
    queryKey: ["dash", "register-payments", openRegister?.id],
    enabled: !!openRegister,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("amount_cents, method")
        .eq("register_id", openRegister!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["dash", "expenses", activeId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("id, description, amount_cents, category, due_date, paid")
        .eq("store_id", activeId!)
        .eq("paid", false)
        .order("due_date");
      if (error) throw error;
      return data ?? [];
    },
  });

  /* ---------- derivados ---------- */

  const closedTabs = tabs.filter(
    (t) => t.status === "closed" && t.closed_at && t.closed_at >= since,
  );
  const openTabs = tabs.filter((t) => t.status === "open");

  const totalSales = payments.reduce((s, p) => s + Number(p.amount_cents), 0);
  const ticket = closedTabs.length ? totalSales / closedTabs.length : 0;

  const todayPayments = payments.filter((p) => p.paid_at >= todayISO);
  const totalToday = todayPayments.reduce((s, p) => s + Number(p.amount_cents), 0);

  const series = useMemo(() => {
    const map = new Map<string, { sales: number; tabs: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const d = startOfDay(new Date());
      d.setDate(d.getDate() - i);
      map.set(d.toISOString().slice(0, 10), { sales: 0, tabs: 0 });
    }
    payments.forEach((p) => {
      const k = dayKey(p.paid_at);
      const row = map.get(k);
      if (row) row.sales += Number(p.amount_cents);
    });
    closedTabs.forEach((t) => {
      const k = dayKey(t.closed_at!);
      const row = map.get(k);
      if (row) row.tabs += 1;
    });
    return Array.from(map.entries()).map(([k, v]) => ({
      day: k.slice(8, 10) + "/" + k.slice(5, 7),
      vendas: v.sales / 100,
      comandas: v.tabs,
      ticket: v.tabs ? v.sales / v.tabs / 100 : 0,
    }));
  }, [payments, closedTabs, days]);

  const byMethod = PAYMENT_METHODS.map((m) => {
    const list = payments.filter((p) => p.method === m.id);
    return {
      ...m,
      count: list.length,
      value: list.reduce((s, p) => s + Number(p.amount_cents), 0),
    };
  });
  const pieData = byMethod.filter((m) => m.value > 0);

  const tracked = products.filter((p) => p.track_stock);
  const stockValue = tracked.reduce(
    (s, p) => s + Number(p.stock_qty) * Number(p.cost_cents),
    0,
  );
  const lowStock = tracked.filter(
    (p) => Number(p.stock_qty) <= Number(p.min_stock),
  );

  const cashIn = movements
    .filter((m) => m.kind === "in")
    .reduce((s, m) => s + Number(m.amount_cents), 0);
  const cashOut = movements
    .filter((m) => m.kind === "out")
    .reduce((s, m) => s + Number(m.amount_cents), 0);
  const registerSales = registerPayments.reduce(
    (s, p) => s + Number(p.amount_cents),
    0,
  );
  const registerBalance = openRegister
    ? Number(openRegister.opening_cents) + registerSales + cashIn - cashOut
    : 0;

  const payablesTotal = expenses.reduce((s, e) => s + Number(e.amount_cents), 0);
  const todayStr = new Date().toISOString().slice(0, 10);
  const overdue = expenses.filter((e) => e.due_date < todayStr);
  const overdueTotal = overdue.reduce((s, e) => s + Number(e.amount_cents), 0);

  return (
    <div className="space-y-8">
      {/* seletor */}
      <div className="card-surface flex flex-wrap items-center gap-3 p-4">
        <IconTile icon={StoreIcon as never} tone="bg-chart-1/12 text-chart-1" />
        <div className="mr-auto">
          <p className="text-xs font-medium text-muted-foreground">Dashboard da loja</p>
          <p className="text-lg font-black">{activeStore?.name ?? "—"}</p>
        </div>
        <select
          className="h-10 rounded-xl border border-border bg-background px-3 text-sm font-semibold"
          value={activeId ?? ""}
          onChange={(e) => setSelected(e.target.value)}
        >
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.is_matriz ? "★ " : ""}
              {s.name}
            </option>
          ))}
        </select>
        <div className="flex rounded-xl border border-border p-1">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setDays(p.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                days === p.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <section>
        <SectionTitle icon={TrendingUp} tone="bg-chart-2/12 text-chart-2">
          Resumo do período
        </SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={CircleDollarSign}
            tone="bg-chart-2/12 text-chart-2"
            label={`Vendas (${days} dias)`}
            value={brl(totalSales)}
            hint={`Hoje ${brl(totalToday)}`}
          />
          <StatCard
            icon={TrendingUp}
            tone="bg-chart-3/15 text-chart-3"
            label="Ticket médio"
            value={brl(ticket)}
            hint={`${closedTabs.length} comandas fechadas`}
          />
          <StatCard
            icon={Boxes}
            tone="bg-chart-1/12 text-chart-1"
            label="Valor em estoque"
            value={brl(stockValue)}
            hint={`${lowStock.length} item(ns) em alerta`}
          />
          <StatCard
            icon={Wallet}
            tone="bg-chart-5/12 text-chart-5"
            label="Contas a pagar"
            value={brl(payablesTotal)}
            hint={overdue.length ? `${overdue.length} vencida(s)` : "Nenhuma vencida"}
          />
        </div>
      </section>

      {/* gráficos */}
      <section className="grid gap-4 xl:grid-cols-2">
        <div className="card-surface p-5">
          <h3 className="mb-4 font-bold">Vendas por dia</h3>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" width={60} />
                <Tooltip
                  formatter={(v: number) => brl(Math.round(v * 100))}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                  }}
                />
                <Bar dataKey="vendas" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-surface p-5">
          <h3 className="mb-4 font-bold">Ticket médio por dia</h3>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" width={60} />
                <Tooltip
                  formatter={(v: number) => brl(Math.round(v * 100))}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="ticket"
                  stroke="var(--chart-3)"
                  strokeWidth={3}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* caixa + comandas + pagamentos */}
      <section className="grid gap-4 xl:grid-cols-3">
        <div className="card-surface p-5">
          <div className="mb-4 flex items-center gap-3">
            <IconTile icon={ArrowLeftRight as never} tone="bg-chart-1/12 text-chart-1" />
            <h3 className="font-bold">Caixa</h3>
          </div>
          {openRegister ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {openRegister.name} · aberto {dateTime(openRegister.opened_at)}
              </p>
              <p className="text-3xl font-black">{brl(registerBalance)}</p>
              <Row label="Abertura" value={brl(Number(openRegister.opening_cents))} />
              <Row label="Vendas no turno" value={brl(registerSales)} />
              <Row label="Suprimentos" value={brl(cashIn)} />
              <Row label="Sangrias" value={`- ${brl(cashOut)}`} />
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhum caixa aberto nesta loja.
            </p>
          )}
        </div>

        <div className="card-surface p-5">
          <div className="mb-4 flex items-center gap-3">
            <IconTile icon={Receipt as never} tone="bg-chart-5/12 text-chart-5" />
            <h3 className="font-bold">Comandas abertas</h3>
            <span className="ml-auto rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold text-muted-foreground">
              {openTabs.length}
            </span>
          </div>
          {openTabs.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma comanda aberta
            </p>
          ) : (
            <ul className="max-h-[240px] divide-y divide-border overflow-auto">
              {openTabs.map((t) => (
                <li key={t.id} className="py-2.5">
                  <p className="text-sm font-bold uppercase">{t.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.kind === "table" ? "Mesa" : "Comanda"} · aberta {dateTime(t.opened_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
            <CheckCircle2 className="size-4 text-chart-2" />
            {closedTabs.length} fechadas no período
          </div>
        </div>

        <div className="card-surface p-5">
          <div className="mb-4 flex items-center gap-3">
            <IconTile icon={ShoppingBag as never} tone="bg-chart-2/12 text-chart-2" />
            <h3 className="font-bold">Formas de pagamento</h3>
          </div>
          <div className="relative h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData.length ? pieData : [{ value: 1, chart: "var(--muted)" }]}
                  dataKey="value"
                  innerRadius={58}
                  outerRadius={80}
                  paddingAngle={2}
                  stroke="none"
                >
                  {(pieData.length ? pieData : [{ chart: "var(--muted)" }]).map((d, i) => (
                    <Cell key={i} fill={d.chart} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold">{brl(totalSales)}</span>
              <span className="text-xs text-muted-foreground">período</span>
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            {byMethod
              .filter((m) => m.value > 0)
              .map((m) => (
                <div key={m.id} className="flex items-center gap-2 text-sm">
                  <span className={`size-3 rounded ${m.tone}`} />
                  <span className="font-semibold uppercase">{m.label}</span>
                  <span className="ml-auto font-bold">{brl(m.value)}</span>
                </div>
              ))}
            {pieData.length === 0 && (
              <p className="text-center text-sm text-muted-foreground">Sem pagamentos</p>
            )}
          </div>
        </div>
      </section>

      {/* estoque + contas a pagar */}
      <section className="grid gap-4 xl:grid-cols-2">
        <div className="card-surface p-5">
          <div className="mb-4 flex items-center gap-3">
            <IconTile icon={AlertTriangle as never} tone="bg-chart-4/15 text-chart-4" />
            <h3 className="font-bold">Estoque em alerta</h3>
            <span className="ml-auto text-xs text-muted-foreground">
              {tracked.length} itens controlados
            </span>
          </div>
          {lowStock.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhum produto abaixo do mínimo
            </p>
          ) : (
            <ul className="max-h-[260px] divide-y divide-border overflow-auto">
              {lowStock.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      mínimo {Number(p.min_stock)}
                    </p>
                  </div>
                  <span className="ml-auto text-sm font-black text-chart-4">
                    {Number(p.stock_qty)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card-surface p-5">
          <div className="mb-4 flex items-center gap-3">
            <IconTile icon={Wallet as never} tone="bg-chart-5/12 text-chart-5" />
            <h3 className="font-bold">Contas a pagar em aberto</h3>
            <span className="ml-auto text-sm font-black">{brl(payablesTotal)}</span>
          </div>
          {overdueTotal > 0 && (
            <p className="mb-3 rounded-xl bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive">
              {overdue.length} conta(s) vencida(s) · {brl(overdueTotal)}
            </p>
          )}
          {expenses.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma conta em aberto
            </p>
          ) : (
            <ul className="max-h-[260px] divide-y divide-border overflow-auto">
              {expenses.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{e.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.category} · vence {shortDate(e.due_date)}
                    </p>
                  </div>
                  <span
                    className={`ml-auto text-sm font-bold ${
                      e.due_date < todayStr ? "text-destructive" : ""
                    }`}
                  >
                    {brl(Number(e.amount_cents))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}

function StatCard({
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
