import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId } from "@/lib/store";
import { brl } from "@/lib/format";
import { CHART_COLORS, delta, groupSum, isoDate, sum } from "@/lib/bi";
import { BiToolbar, ChartCard, EmptyBi, KpiCard, useBiPeriod } from "@/components/bi/bi-kit";

const TIPO: Record<string, string> = {
  diaria: "Diárias",
  dobra: "Dobras",
  gratificacao: "Gratificações",
  comissao: "Comissões",
  consumo: "Consumo",
  vale: "Vales",
  desconto: "Descontos",
};

export function BiEquipe() {
  const { period, setPeriod, offset, setOffset, range, prev } = useBiPeriod("mes");
  const store = currentStoreId();

  const { data } = useQuery({
    queryKey: ["bi-equipe", store, period, offset],
    queryFn: async () => {
      const [emps, tabs, entries, entriesPrev] = await Promise.all([
        supabase
          .from("employees")
          .select("id, name, active, commission_pct, base_salary_cents")
          .eq("store_id", store),
        supabase
          .from("tabs")
          .select("id, employee_id, closed_at")
          .eq("store_id", store)
          .not("closed_at", "is", null)
          .gte("closed_at", range.start.toISOString())
          .lte("closed_at", range.end.toISOString()),
        supabase
          .from("employee_entries")
          .select("employee_id, kind, amount_cents, ref_date, paid")
          .eq("store_id", store)
          .gte("ref_date", isoDate(range.start))
          .lte("ref_date", isoDate(range.end)),
        supabase
          .from("employee_entries")
          .select("amount_cents")
          .eq("store_id", store)
          .gte("ref_date", isoDate(prev.start))
          .lte("ref_date", isoDate(prev.end)),
      ]);
      if (emps.error) throw emps.error;

      const ids = (tabs.data ?? []).map((t) => t.id);
      const items = ids.length
        ? await supabase
            .from("tab_items")
            .select("tab_id, quantity, unit_price_cents")
            .in("tab_id", ids)
        : { data: [], error: null };

      return {
        employees: emps.data ?? [],
        tabs: tabs.data ?? [],
        items: items.data ?? [],
        entries: entries.data ?? [],
        entriesPrev: entriesPrev.data ?? [],
      };
    },
  });

  const employees = data?.employees ?? [];
  const tabs = data?.tabs ?? [];
  const items = data?.items ?? [];
  const entries = data?.entries ?? [];

  const totalTab = (tabId: string) =>
    sum(
      items.filter((i) => i.tab_id === tabId),
      (i) => Number(i.quantity) * Number(i.unit_price_cents),
    );

  const vendasPorFuncionario = groupSum(
    tabs.filter((t) => t.employee_id),
    (t) => employees.find((e) => e.id === t.employee_id)?.name ?? "Sem responsável",
    (t) => totalTab(t.id),
  );

  const custoEquipe = sum(entries, (e) => Number(e.amount_cents));
  const custoAnt = sum(data?.entriesPrev ?? [], (e) => Number(e.amount_cents));
  const comissoes = sum(entries.filter((e) => e.kind === "comissao"), (e) => Number(e.amount_cents));
  const pendentes = sum(entries.filter((e) => !e.paid), (e) => Number(e.amount_cents));
  const vendasTotal = sum(vendasPorFuncionario, (v) => v.total);
  const ativos = employees.filter((e) => e.active).length;
  const porTipo = groupSum(entries, (e) => TIPO[e.kind] ?? e.kind, (e) => Number(e.amount_cents));

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
        <KpiCard label="Funcionários ativos" value={String(ativos)} />
        <KpiCard label="Vendas atendidas" value={brl(vendasTotal)} />
        <KpiCard label="Custo de equipe" value={brl(custoEquipe)} deltaPct={delta(custoEquipe, custoAnt)} invert />
        <KpiCard label="Comissões" value={brl(comissoes)} />
        <KpiCard label="A pagar" value={brl(pendentes)} invert />
      </div>

      <ChartCard title="Vendas por funcionário" subtitle="Comandas e mesas atendidas no período">
        {vendasPorFuncionario.length === 0 ? (
          <EmptyBi />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={vendasPorFuncionario.map((v) => ({ ...v, total: v.total / 100 }))}
              layout="vertical"
              margin={{ left: 40 }}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis type="number" fontSize={11} />
              <YAxis type="category" dataKey="name" fontSize={11} width={120} />
              <Tooltip formatter={(v: number) => brl(Math.round(v * 100))} contentStyle={{ borderRadius: 12 }} />
              <Bar dataKey="total" name="Vendas" fill={CHART_COLORS[0]} radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="Lançamentos por tipo" subtitle="Diárias, dobras, gratificações, vales e consumo">
        {porTipo.length === 0 ? (
          <EmptyBi />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={porTipo.map((t) => ({ ...t, total: t.total / 100 }))}
                dataKey="total"
                nameKey="name"
                outerRadius={95}
                label={(e: { name?: string }) => e.name ?? ""}
              >
                {porTipo.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => brl(Math.round(v * 100))} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}
