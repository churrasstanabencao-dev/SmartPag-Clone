import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store";
import { brl } from "@/lib/format";
import { CHART_COLORS, compareSeries, delta, groupSum, sum } from "@/lib/bi";
import { BiToolbar, ChartCard, EmptyBi, KpiCard, useBiPeriod } from "@/components/bi/bi-kit";

export function BiRede() {
  const { period, setPeriod, offset, setOffset, range, prev } = useBiPeriod("mes");
  const { stores, networkStores } = useStore();
  const lojas = (networkStores?.length ? networkStores : stores) ?? [];
  const ids = lojas.map((s) => s.id);

  const { data } = useQuery({
    enabled: ids.length > 0,
    queryKey: ["bi-rede", ids.join(","), period, offset],
    queryFn: async () => {
      const [pay, payPrev, tabs] = await Promise.all([
        supabase
          .from("payments")
          .select("store_id, amount_cents, paid_at")
          .in("store_id", ids)
          .gte("paid_at", range.start.toISOString())
          .lte("paid_at", range.end.toISOString()),
        supabase
          .from("payments")
          .select("store_id, amount_cents, paid_at")
          .in("store_id", ids)
          .gte("paid_at", prev.start.toISOString())
          .lte("paid_at", prev.end.toISOString()),
        supabase
          .from("tabs")
          .select("store_id, closed_at")
          .in("store_id", ids)
          .not("closed_at", "is", null)
          .gte("closed_at", range.start.toISOString())
          .lte("closed_at", range.end.toISOString()),
      ]);
      if (pay.error) throw pay.error;
      return { pagamentos: pay.data ?? [], anterior: payPrev.data ?? [], tabs: tabs.data ?? [] };
    },
  });

  const pagamentos = data?.pagamentos ?? [];
  const anterior = data?.anterior ?? [];
  const tabs = data?.tabs ?? [];
  const nome = (id: string | null) => lojas.find((s) => s.id === id)?.name ?? "Loja";

  const receita = sum(pagamentos, (p) => p.amount_cents);
  const receitaAnt = sum(anterior, (p) => p.amount_cents);
  const pedidos = tabs.length;
  const ticket = pedidos ? receita / pedidos : 0;

  const porLoja = groupSum(pagamentos, (p) => nome(p.store_id), (p) => p.amount_cents);
  const porLojaAnt = new Map(
    groupSum(anterior, (p) => nome(p.store_id), (p) => p.amount_cents).map((r) => [r.name, r.total]),
  );
  const serie = compareSeries(
    period,
    range,
    pagamentos.map((p) => ({ date: p.paid_at, value: p.amount_cents })),
    anterior.map((p) => ({ date: p.paid_at, value: p.amount_cents })),
  );

  return (
    <div className="space-y-5">
      <BiToolbar
        period={period}
        setPeriod={setPeriod}
        offset={offset}
        setOffset={setOffset}
        range={range}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Faturamento da rede" value={brl(receita)} deltaPct={delta(receita, receitaAnt)} />
        <KpiCard label="Pedidos" value={String(pedidos)} />
        <KpiCard label="Ticket médio" value={brl(ticket)} />
        <KpiCard label="Lojas ativas no período" value={String(porLoja.length)} hint={`${lojas.length} na rede`} />
      </div>

      <ChartCard title="Faturamento da rede" subtitle="Atual x período anterior">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={serie}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="label" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip formatter={(v: number) => brl(Math.round(v * 100))} contentStyle={{ borderRadius: 12 }} />
            <Legend />
            <Line type="monotone" dataKey="atual" stroke={CHART_COLORS[0]} strokeWidth={2.5} dot={false} />
            <Line
              type="monotone"
              dataKey="anterior"
              stroke={CHART_COLORS[3]}
              strokeDasharray="5 4"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Ranking por loja">
        {porLoja.length === 0 ? (
          <EmptyBi />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={porLoja.map((l) => ({ ...l, total: l.total / 100 }))}
                layout="vertical"
                margin={{ left: 40 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis type="number" fontSize={11} />
                <YAxis type="category" dataKey="name" fontSize={11} width={140} />
                <Tooltip formatter={(v: number) => brl(Math.round(v * 100))} contentStyle={{ borderRadius: 12 }} />
                <Bar dataKey="total" name="Faturamento" fill={CHART_COLORS[2]} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="divide-y divide-border">
              {porLoja.map((l) => {
                const d = delta(l.total, porLojaAnt.get(l.name) ?? 0);
                return (
                  <div key={l.name} className="flex items-center gap-3 py-2 text-sm">
                    <span className="font-semibold">{l.name}</span>
                    <span className="ml-auto font-bold">{brl(l.total)}</span>
                    <span
                      className={
                        "w-20 text-right text-xs font-semibold " +
                        (d == null ? "text-muted-foreground" : d >= 0 ? "text-chart-2" : "text-destructive")
                      }
                    >
                      {d == null ? "—" : `${d > 0 ? "+" : ""}${d.toFixed(1)}%`}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </ChartCard>
    </div>
  );
}
