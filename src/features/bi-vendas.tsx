import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
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
import {
  CHART_COLORS,
  compareSeries,
  delta,
  groupSum,
  sum,
} from "@/lib/bi";
import { BiToolbar, ChartCard, EmptyBi, KpiCard, useBiPeriod } from "@/components/bi/bi-kit";

const CANAL: Record<string, string> = {
  mesa: "Mesa",
  comanda: "Comanda",
  balcao: "Balcão",
  delivery: "Delivery",
  transferencia: "Transferência",
};

export function BiVendas() {
  const { period, setPeriod, offset, setOffset, range, prev } = useBiPeriod("mes");
  const store = currentStoreId();

  const { data, isLoading } = useQuery({
    queryKey: ["bi-vendas", store, period, offset],
    queryFn: async () => {
      const [pay, payPrev, tabs, items] = await Promise.all([
        supabase
          .from("payments")
          .select("amount_cents, method, paid_at")
          .eq("store_id", store)
          .gte("paid_at", range.start.toISOString())
          .lte("paid_at", range.end.toISOString()),
        supabase
          .from("payments")
          .select("amount_cents, paid_at")
          .eq("store_id", store)
          .gte("paid_at", prev.start.toISOString())
          .lte("paid_at", prev.end.toISOString()),
        supabase
          .from("tabs")
          .select("id, kind, closed_at, delivery_fee_cents")
          .eq("store_id", store)
          .not("closed_at", "is", null)
          .gte("closed_at", range.start.toISOString())
          .lte("closed_at", range.end.toISOString()),
        supabase
          .from("tab_items")
          .select("name, quantity, unit_price_cents, created_at")
          .eq("store_id", store)
          .gte("created_at", range.start.toISOString())
          .lte("created_at", range.end.toISOString()),
      ]);
      if (pay.error) throw pay.error;
      return {
        pagamentos: pay.data ?? [],
        anterior: payPrev.data ?? [],
        pedidos: tabs.data ?? [],
        itens: items.data ?? [],
      };
    },
  });

  const pagamentos = data?.pagamentos ?? [];
  const anterior = data?.anterior ?? [];
  const pedidos = data?.pedidos ?? [];
  const itens = data?.itens ?? [];

  const receita = sum(pagamentos, (p) => p.amount_cents);
  const receitaAnt = sum(anterior, (p) => p.amount_cents);
  const qtdPedidos = pedidos.length;
  const ticket = qtdPedidos ? receita / qtdPedidos : 0;
  const entregas = sum(pedidos, (t) => t.delivery_fee_cents ?? 0);
  const itensVendidos = sum(itens, (i) => Number(i.quantity));

  const serie = compareSeries(
    period,
    range,
    pagamentos.map((p) => ({ date: p.paid_at, value: p.amount_cents })),
    anterior.map((p) => ({ date: p.paid_at, value: p.amount_cents })),
  );

  const porMetodo = groupSum(pagamentos, (p) => p.method, (p) => p.amount_cents);
  const porCanal = groupSum(
    pedidos,
    (t) => CANAL[t.kind] ?? t.kind,
    () => 1,
  );
  const topProdutos = groupSum(
    itens,
    (i) => i.name,
    (i) => Number(i.quantity) * Number(i.unit_price_cents),
  ).slice(0, 10);

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
        <KpiCard label="Faturamento" value={brl(receita)} deltaPct={delta(receita, receitaAnt)} />
        <KpiCard
          label="Pedidos"
          value={String(qtdPedidos)}
          hint="fechados no período"
        />
        <KpiCard label="Ticket médio" value={brl(ticket)} />
        <KpiCard label="Itens vendidos" value={itensVendidos.toLocaleString("pt-BR")} />
        <KpiCard label="Taxas de entrega" value={brl(entregas)} />
      </div>

      <ChartCard title="Faturamento no período" subtitle="Atual x período anterior">
        {isLoading ? (
          <EmptyBi>Carregando…</EmptyBi>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={serie}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip
                formatter={(v: number) => brl(Math.round(v * 100))}
                contentStyle={{ borderRadius: 12 }}
              />
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
        )}
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Formas de pagamento">
          {porMetodo.length === 0 ? (
            <EmptyBi />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={porMetodo.map((m) => ({ ...m, total: m.total / 100 }))}
                  dataKey="total"
                  nameKey="name"
                  outerRadius={95}
                  label={(e: { name?: string }) => e.name ?? ""}
                >
                  {porMetodo.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => brl(Math.round(v * 100))} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Pedidos por canal" subtitle="Mesa, balcão e delivery">
          {porCanal.length === 0 ? (
            <EmptyBi />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={porCanal}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis allowDecimals={false} fontSize={11} />
                <Tooltip contentStyle={{ borderRadius: 12 }} />
                <Bar dataKey="total" name="Pedidos" fill={CHART_COLORS[1]} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <ChartCard title="Top 10 produtos por faturamento">
        {topProdutos.length === 0 ? (
          <EmptyBi />
        ) : (
          <div className="divide-y divide-border">
            {topProdutos.map((p, i) => (
              <div key={p.name} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-6 text-muted-foreground">{i + 1}º</span>
                <span className="font-semibold">{p.name}</span>
                <span className="ml-auto font-bold">{brl(p.total)}</span>
              </div>
            ))}
          </div>
        )}
      </ChartCard>
    </div>
  );
}
