import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Percent, Receipt, Truck } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store";
import { brl, dateTime, shortDate } from "@/lib/format";
import { SectionTitle, IconTile } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Payment = {
  id: string;
  store_id: string | null;
  tab_id: string | null;
  amount_cents: number;
  method: string;
  paid_at: string;
};

type Tab = { id: string; name: string; kind: string; store_id: string | null; closed_at: string | null };

type Transfer = {
  id: string;
  to_store_id: string;
  doc_number: string | null;
  total_cents: number;
  status: string;
  payment_status: string;
  created_at: string;
};

export function VendasPorLojaModule() {
  const { networkStores, matriz } = useStore();
  const [days, setDays] = useState("30");
  const [storeFilter, setStoreFilter] = useState("todas");
  const [commission, setCommission] = useState("5");
  const [view, setView] = useState<"comandas" | "transferencias">("comandas");

  const since = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - Number(days));
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [days]);

  const branches = useMemo(
    () => networkStores.filter((s) => s.id !== matriz?.id),
    [networkStores, matriz?.id],
  );
  const branchIds = branches.map((s) => s.id);
  const storeName = (id: string | null) =>
    networkStores.find((s) => s.id === id)?.name ?? "—";

  const { data: payments = [] } = useQuery({
    queryKey: ["vpl", "payments", branchIds.join(","), since],
    enabled: branchIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, store_id, tab_id, amount_cents, method, paid_at")
        .in("store_id", branchIds)
        .gte("paid_at", since)
        .order("paid_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as Payment[];
    },
    refetchInterval: 30000,
  });

  const tabIds = useMemo(
    () => Array.from(new Set(payments.map((p) => p.tab_id).filter(Boolean))) as string[],
    [payments],
  );

  const { data: tabs = [] } = useQuery({
    queryKey: ["vpl", "tabs", tabIds.join(",")],
    enabled: tabIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tabs")
        .select("id, name, kind, store_id, closed_at")
        .in("id", tabIds);
      if (error) throw error;
      return (data ?? []) as Tab[];
    },
  });

  const { data: transfers = [] } = useQuery({
    queryKey: ["vpl", "transfers", matriz?.id, since],
    enabled: !!matriz?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfers")
        .select("id, to_store_id, doc_number, total_cents, status, payment_status, created_at")
        .eq("from_store_id", matriz!.id)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Transfer[];
    },
    refetchInterval: 30000,
  });

  const rate = Number(commission.replace(",", ".")) || 0;
  const inFilter = (id: string | null) => storeFilter === "todas" || id === storeFilter;

  const rows = useMemo(() => {
    return branches
      .filter((s) => inFilter(s.id))
      .map((s) => {
        const pay = payments.filter((p) => p.store_id === s.id);
        const sales = pay.reduce((a, p) => a + p.amount_cents, 0);
        const comandas = new Set(pay.map((p) => p.tab_id).filter(Boolean)).size;
        const transf = transfers
          .filter((t) => t.to_store_id === s.id && t.status !== "rejected")
          .reduce((a, t) => a + t.total_cents, 0);
        return {
          id: s.id,
          name: s.name,
          sales,
          comandas,
          ticket: comandas > 0 ? Math.round(sales / comandas) : 0,
          transf,
          commission: Math.round((sales * rate) / 100),
        };
      })
      .sort((a, b) => b.sales - a.sales);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches, payments, transfers, rate, storeFilter]);

  const totals = rows.reduce(
    (a, r) => ({
      sales: a.sales + r.sales,
      comandas: a.comandas + r.comandas,
      transf: a.transf + r.transf,
      commission: a.commission + r.commission,
    }),
    { sales: 0, comandas: 0, transf: 0, commission: 0 },
  );

  const chart = rows.map((r) => ({
    name: r.name,
    Vendas: r.sales / 100,
    "Compras da matriz": r.transf / 100,
    Comissão: r.commission / 100,
  }));

  const comandaHistory = useMemo(() => {
    const byTab = new Map<string, { name: string; store: string; total: number; when: string; methods: Set<string> }>();
    for (const p of payments) {
      if (!inFilter(p.store_id)) continue;
      const key = p.tab_id ?? p.id;
      const t = tabs.find((x) => x.id === p.tab_id);
      const cur = byTab.get(key);
      if (cur) {
        cur.total += p.amount_cents;
        cur.methods.add(p.method);
      } else {
        byTab.set(key, {
          name: t?.name ?? "Venda avulsa",
          store: storeName(p.store_id),
          total: p.amount_cents,
          when: p.paid_at,
          methods: new Set([p.method]),
        });
      }
    }
    return Array.from(byTab.values())
      .sort((a, b) => (a.when < b.when ? 1 : -1))
      .slice(0, 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments, tabs, storeFilter]);

  const transferHistory = transfers.filter((t) => inFilter(t.to_store_id)).slice(0, 100);

  return (
    <div className="space-y-5">
      <SectionTitle icon={BarChart3} tone="bg-primary-soft text-primary">
        Vendas por loja
      </SectionTitle>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Label className="text-xs">Loja</Label>
          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as filiais</SelectItem>
              {branches.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-44">
          <Label className="text-xs">Período</Label>
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
        <div className="w-36">
          <Label className="text-xs">Comissão (%)</Label>
          <Input
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
            inputMode="decimal"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Kpi icon={Receipt} label="Vendas das filiais" value={brl(totals.sales)} hint={`${totals.comandas} comandas`} />
        <Kpi
          icon={Receipt}
          label="Ticket médio da rede"
          value={brl(totals.comandas ? Math.round(totals.sales / totals.comandas) : 0)}
          hint="Por comanda"
        />
        <Kpi icon={Truck} label="Compras da matriz" value={brl(totals.transf)} hint="Transferências enviadas" />
        <Kpi icon={Percent} label="Comissões" value={brl(totals.commission)} hint={`${rate}% sobre as vendas`} />
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-3 text-sm font-bold">Comparativo por loja</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip formatter={(v: any) => brl(Math.round(Number(v) * 100))} />
              <Legend />
              <Bar dataKey="Vendas" fill="hsl(var(--chart-1))" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Compras da matriz" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Comissão" fill="hsl(var(--chart-4))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Loja</th>
              <th className="px-4 py-3 text-right">Vendas</th>
              <th className="px-4 py-3 text-right">Comandas</th>
              <th className="px-4 py-3 text-right">Ticket médio</th>
              <th className="px-4 py-3 text-right">Compras da matriz</th>
              <th className="px-4 py-3 text-right">Comissão</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-3 font-semibold">{r.name}</td>
                <td className="px-4 py-3 text-right">{brl(r.sales)}</td>
                <td className="px-4 py-3 text-right">{r.comandas}</td>
                <td className="px-4 py-3 text-right">{brl(r.ticket)}</td>
                <td className="px-4 py-3 text-right">{brl(r.transf)}</td>
                <td className="px-4 py-3 text-right font-semibold">{brl(r.commission)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  Sem vendas no período.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex w-fit gap-1 rounded-2xl bg-muted p-1">
        {(
          [
            ["comandas", "Histórico de comandas"],
            ["transferencias", "Histórico de transferências"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={
              "rounded-xl px-4 py-2 text-sm font-bold transition-colors " +
              (view === id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {label}
          </button>
        ))}
      </div>

      {view === "comandas" ? (
        <div className="rounded-2xl border border-border bg-card p-5">
          {comandaHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma comanda no período.</p>
          ) : (
            <div className="space-y-2">
              {comandaHistory.map((c, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-bold">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.store} · {dateTime(c.when)} · {Array.from(c.methods).join(", ")}
                    </p>
                  </div>
                  <span className="text-sm font-bold">{brl(c.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-5">
          {transferHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma transferência no período.</p>
          ) : (
            <div className="space-y-2">
              {transferHistory.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-bold">
                      {storeName(t.to_store_id)} — {t.doc_number ?? t.id.slice(0, 8)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {shortDate(t.created_at)} · {t.status} ·{" "}
                      {t.payment_status === "paid" ? "pago" : "em aberto"}
                    </p>
                  </div>
                  <span className="text-sm font-bold">{brl(t.total_cents)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
}: {
  icon: any;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <IconTile icon={icon} />
        <div>
          <p className="text-xs font-semibold text-muted-foreground">{label}</p>
          <p className="text-lg font-black">{value}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
    </div>
  );
}
