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
import { brl } from "@/lib/format";
import { stockReasonLabel } from "@/lib/smartpag";
import { CHART_COLORS, bucketsFor, bucketKey, delta, groupSum, sum } from "@/lib/bi";
import { BiToolbar, ChartCard, EmptyBi, KpiCard, useBiPeriod } from "@/components/bi/bi-kit";

type Mov = {
  quantity: number;
  reason: string;
  created_at: string;
  product_id: string;
};

export function BiEstoque() {
  const { period, setPeriod, offset, setOffset, range, prev } = useBiPeriod("mes");
  const store = currentStoreId();

  const { data } = useQuery({
    queryKey: ["bi-estoque", store, period, offset],
    queryFn: async () => {
      const [movs, movsPrev, prods, compras] = await Promise.all([
        supabase
          .from("stock_movements")
          .select("quantity, reason, created_at, product_id")
          .eq("store_id", store)
          .gte("created_at", range.start.toISOString())
          .lte("created_at", range.end.toISOString()),
        supabase
          .from("stock_movements")
          .select("quantity, reason, created_at, product_id")
          .eq("store_id", store)
          .gte("created_at", prev.start.toISOString())
          .lte("created_at", prev.end.toISOString()),
        supabase
          .from("products")
          .select("id, name, cost_cents, stock_qty, min_stock, track_stock")
          .eq("store_id", store),
        supabase
          .from("purchases")
          .select("total_cents, issued_at, status")
          .eq("store_id", store)
          .gte("issued_at", range.start.toISOString().slice(0, 10))
          .lte("issued_at", range.end.toISOString().slice(0, 10)),
      ]);
      if (movs.error) throw movs.error;
      return {
        movs: (movs.data ?? []) as Mov[],
        movsPrev: (movsPrev.data ?? []) as Mov[],
        produtos: prods.data ?? [],
        compras: compras.data ?? [],
      };
    },
  });

  const movs = data?.movs ?? [];
  const movsPrev = data?.movsPrev ?? [];
  const produtos = data?.produtos ?? [];
  const compras = data?.compras ?? [];
  const custo = (id: string) =>
    Number(produtos.find((p) => p.id === id)?.cost_cents ?? 0);
  const nome = (id: string) => produtos.find((p) => p.id === id)?.name ?? "Produto";

  const entradas = movs.filter((m) => Number(m.quantity) > 0);
  const saidas = movs.filter((m) => Number(m.quantity) < 0);
  const perdasReasons = ["perda", "desperdicio", "quebra", "vencimento", "extravio"];
  const perdas = saidas.filter((m) => perdasReasons.some((r) => m.reason.includes(r)));

  const valorEntradas = sum(entradas, (m) => Number(m.quantity) * custo(m.product_id));
  const valorSaidas = sum(saidas, (m) => -Number(m.quantity) * custo(m.product_id));
  const valorPerdas = sum(perdas, (m) => -Number(m.quantity) * custo(m.product_id));
  const perdasAnt = sum(
    movsPrev.filter((m) => Number(m.quantity) < 0 && perdasReasons.some((r) => m.reason.includes(r))),
    (m) => -Number(m.quantity) * custo(m.product_id),
  );
  const saidasAnt = sum(
    movsPrev.filter((m) => Number(m.quantity) < 0),
    (m) => -Number(m.quantity) * custo(m.product_id),
  );

  const valorEstoque = sum(produtos, (p) => Number(p.stock_qty) * Number(p.cost_cents));
  const abaixoMinimo = produtos.filter(
    (p) => p.track_stock && Number(p.stock_qty) <= Number(p.min_stock),
  ).length;
  const totalCompras = sum(compras, (c) => Number(c.total_cents));
  const giro = valorEstoque ? (valorSaidas / valorEstoque) * 100 : 0;

  const buckets = bucketsFor(period, range);
  const serie = buckets.map((b) => {
    const inB = movs.filter((m) => bucketKey(m.created_at, period) === b.key);
    return {
      label: b.label,
      entradas: sum(inB.filter((m) => Number(m.quantity) > 0), (m) => Number(m.quantity) * custo(m.product_id)) / 100,
      saidas: sum(inB.filter((m) => Number(m.quantity) < 0), (m) => -Number(m.quantity) * custo(m.product_id)) / 100,
    };
  });

  const porMotivo = groupSum(
    saidas,
    (m) => stockReasonLabel(m.reason),
    (m) => -Number(m.quantity) * custo(m.product_id),
  );
  const topConsumo = groupSum(
    saidas,
    (m) => nome(m.product_id),
    (m) => -Number(m.quantity),
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
        <KpiCard label="Valor em estoque" value={brl(valorEstoque)} hint="saldo atual" />
        <KpiCard label="Entradas no período" value={brl(valorEntradas)} />
        <KpiCard label="Consumo / saídas" value={brl(valorSaidas)} deltaPct={delta(valorSaidas, saidasAnt)} />
        <KpiCard label="Perdas" value={brl(valorPerdas)} deltaPct={delta(valorPerdas, perdasAnt)} invert />
        <KpiCard label="Compras lançadas" value={brl(totalCompras)} hint={`giro ${giro.toFixed(1)}%`} />
      </div>

      {abaixoMinimo > 0 && (
        <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
          {abaixoMinimo} produto(s) no estoque mínimo ou abaixo.
        </p>
      )}

      <ChartCard title="Entradas x saídas" subtitle="Valorizado pelo custo médio">
        {serie.length === 0 ? (
          <EmptyBi />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={serie}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip formatter={(v: number) => brl(Math.round(v * 100))} contentStyle={{ borderRadius: 12 }} />
              <Legend />
              <Bar dataKey="entradas" name="Entradas" fill={CHART_COLORS[1]} radius={[6, 6, 0, 0]} />
              <Bar dataKey="saidas" name="Saídas" fill={CHART_COLORS[4]} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Saídas por motivo">
          {porMotivo.length === 0 ? (
            <EmptyBi />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={porMotivo.map((m) => ({ ...m, total: m.total / 100 }))}
                  dataKey="total"
                  nameKey="name"
                  outerRadius={95}
                  label={(e: { name?: string }) => e.name ?? ""}
                >
                  {porMotivo.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => brl(Math.round(v * 100))} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Top 10 produtos consumidos" subtitle="Quantidade que saiu do estoque">
          {topConsumo.length === 0 ? (
            <EmptyBi />
          ) : (
            <div className="divide-y divide-border">
              {topConsumo.map((p, i) => (
                <div key={p.name} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-6 text-muted-foreground">{i + 1}º</span>
                  <span className="font-semibold">{p.name}</span>
                  <span className="ml-auto font-bold">
                    {p.total.toLocaleString("pt-BR")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
