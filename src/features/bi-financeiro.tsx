import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId } from "@/lib/store";
import { brl, shortDate } from "@/lib/format";
import { CHART_COLORS, bucketKey, bucketsFor, delta, groupSum, isoDate, sum } from "@/lib/bi";
import { BiToolbar, ChartCard, EmptyBi, KpiCard, useBiPeriod } from "@/components/bi/bi-kit";

export function BiFinanceiro() {
  const { period, setPeriod, offset, setOffset, range, prev } = useBiPeriod("mes");
  const store = currentStoreId();

  const { data } = useQuery({
    queryKey: ["bi-financeiro", store, period, offset],
    queryFn: async () => {
      const [desp, despPrev, rec, recPrev] = await Promise.all([
        supabase
          .from("expenses")
          .select("description, amount_cents, category, due_date, paid, provisioned")
          .eq("store_id", store)
          .gte("due_date", isoDate(range.start))
          .lte("due_date", isoDate(range.end)),
        supabase
          .from("expenses")
          .select("amount_cents, due_date")
          .eq("store_id", store)
          .gte("due_date", isoDate(prev.start))
          .lte("due_date", isoDate(prev.end)),
        supabase
          .from("payments")
          .select("amount_cents, paid_at")
          .eq("store_id", store)
          .gte("paid_at", range.start.toISOString())
          .lte("paid_at", range.end.toISOString()),
        supabase
          .from("payments")
          .select("amount_cents")
          .eq("store_id", store)
          .gte("paid_at", prev.start.toISOString())
          .lte("paid_at", prev.end.toISOString()),
      ]);
      if (desp.error) throw desp.error;
      return {
        despesas: desp.data ?? [],
        despesasPrev: despPrev.data ?? [],
        receitas: rec.data ?? [],
        receitasPrev: recPrev.data ?? [],
      };
    },
  });

  const despesas = data?.despesas ?? [];
  const receitas = data?.receitas ?? [];
  const totalDesp = sum(despesas, (d) => Number(d.amount_cents));
  const totalDespAnt = sum(data?.despesasPrev ?? [], (d) => Number(d.amount_cents));
  const totalRec = sum(receitas, (r) => Number(r.amount_cents));
  const totalRecAnt = sum(data?.receitasPrev ?? [], (r) => Number(r.amount_cents));
  const pagas = sum(despesas.filter((d) => d.paid), (d) => Number(d.amount_cents));
  const aPagar = totalDesp - pagas;
  const resultado = totalRec - totalDesp;
  const resultadoAnt = totalRecAnt - totalDespAnt;
  const margem = totalRec ? (resultado / totalRec) * 100 : 0;

  const buckets = bucketsFor(period, range);
  const serie = buckets.map((b) => ({
    label: b.label,
    receita:
      sum(
        receitas.filter((r) => bucketKey(r.paid_at, period) === b.key),
        (r) => Number(r.amount_cents),
      ) / 100,
    despesa:
      sum(
        despesas.filter((d) => bucketKey(`${d.due_date}T12:00:00`, period) === b.key),
        (d) => Number(d.amount_cents),
      ) / 100,
  }));

  const porCategoria = groupSum(despesas, (d) => d.category, (d) => Number(d.amount_cents));
  const maiores = [...despesas]
    .sort((a, b) => Number(b.amount_cents) - Number(a.amount_cents))
    .slice(0, 8);

  return (
    <div className="space-y-5">
      <BiToolbar
        period={period}
        setPeriod={setPeriod}
        offset={offset}
        setOffset={setOffset}
        range={range}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Receita" value={brl(totalRec)} deltaPct={delta(totalRec, totalRecAnt)} />
        <KpiCard label="Despesas" value={brl(totalDesp)} deltaPct={delta(totalDesp, totalDespAnt)} invert />
        <KpiCard label="Resultado" value={brl(resultado)} deltaPct={delta(resultado, resultadoAnt)} />
        <KpiCard label="Margem" value={`${margem.toFixed(1)}%`} />
        <KpiCard label="Em aberto" value={brl(aPagar)} hint={`${brl(pagas)} já pagos`} invert />
      </div>

      <ChartCard title="Receita x despesa" subtitle="Fluxo do período">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={serie}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="label" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip formatter={(v: number) => brl(Math.round(v * 100))} contentStyle={{ borderRadius: 12 }} />
            <Legend />
            <Bar dataKey="receita" name="Receita" fill={CHART_COLORS[1]} radius={[6, 6, 0, 0]} />
            <Bar dataKey="despesa" name="Despesa" fill={CHART_COLORS[4]} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Despesas por categoria">
          {porCategoria.length === 0 ? (
            <EmptyBi />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={porCategoria.map((c) => ({ ...c, total: c.total / 100 }))}
                  dataKey="total"
                  nameKey="name"
                  outerRadius={95}
                  label={(e: { name?: string }) => e.name ?? ""}
                >
                  {porCategoria.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => brl(Math.round(v * 100))} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Maiores contas do período">
          {maiores.length === 0 ? (
            <EmptyBi />
          ) : (
            <div className="divide-y divide-border">
              {maiores.map((d, i) => (
                <div key={i} className="flex items-center gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{d.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {shortDate(d.due_date)} · {d.category} ·{" "}
                      {d.paid ? "pago" : d.provisioned ? "provisionado" : "em aberto"}
                    </p>
                  </div>
                  <span className="ml-auto font-bold">{brl(Number(d.amount_cents))}</span>
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
