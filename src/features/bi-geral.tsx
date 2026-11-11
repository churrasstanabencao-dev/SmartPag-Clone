import { useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { useStore } from "@/lib/store";
import { brl } from "@/lib/format";
import { CHART_COLORS, compareSeries, delta, groupSum, sum } from "@/lib/bi";
import { BiToolbar, ChartCard, EmptyBi, KpiCard, useBiPeriod } from "@/components/bi/bi-kit";

const CANAIS: Record<string, string> = {
  mesa: "Mesa",
  comanda: "Comanda",
  balcao: "Balcão",
  delivery: "Delivery",
  transferencia: "Transferência",
};

const METODOS: Record<string, string> = {
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito: "Crédito",
  pix: "PIX",
};

/**
 * BI executivo da rede: reúne vendas, finanças, produtos e estoque
 * de TODAS as lojas em uma visão única.
 */
export function BiGeral({
  storeIds,
  escopo = "da rede",
  toolbarRight,
}: {
  /** quando informado, limita o BI a estas lojas */
  storeIds?: string[];
  /** sufixo usado nos títulos, ex.: "da rede" ou "da loja" */
  escopo?: string;
  toolbarRight?: ReactNode;
} = {}) {
  const qc = useQueryClient();
  const { period, setPeriod, offset, setOffset, range, prev } = useBiPeriod("mes");
  const { stores, networkStores } = useStore();
  const todas = (networkStores?.length ? networkStores : stores) ?? [];
  const lojas = storeIds ? todas.filter((s) => storeIds.includes(s.id)) : todas;
  const ids = storeIds ?? lojas.map((s) => s.id);

  const { data } = useQuery({
    enabled: ids.length > 0,
    queryKey: ["bi-geral", ids.join(","), period, offset],
    queryFn: async () => {
      const start = range.start.toISOString();
      const end = range.end.toISOString();
      const [pay, payPrev, tabs, items, expenses, expensesPrev, products, receivables, receivablesPrev] = await Promise.all([
        supabase
          .from("payments")
          .select("store_id, amount_cents, method, paid_at")
          .in("store_id", ids)
          .gte("paid_at", start)
          .lte("paid_at", end),
        supabase
          .from("payments")
          .select("amount_cents, paid_at, store_id")
          .in("store_id", ids)
          .gte("paid_at", prev.start.toISOString())
          .lte("paid_at", prev.end.toISOString()),
        supabase
          .from("tabs")
          .select("id, store_id, kind, closed_at, delivery_fee_cents")
          .in("store_id", ids)
          .not("closed_at", "is", null)
          .gte("closed_at", start)
          .lte("closed_at", end),
        supabase
          .from("tab_items")
          .select("name, quantity, unit_price_cents, created_at")
          .in("store_id", ids)
          .gte("created_at", start)
          .lte("created_at", end),
        supabase
          .from("expenses")
          .select("amount_cents, category, paid, due_date, provisioned")
          .in("store_id", ids)
          .gte("due_date", start.slice(0, 10))
          .lte("due_date", end.slice(0, 10)),
        supabase
          .from("expenses")
          .select("amount_cents, paid, due_date")
          .in("store_id", ids)
          .gte("due_date", prev.start.toISOString().slice(0, 10))
          .lte("due_date", prev.end.toISOString().slice(0, 10)),
        supabase
          .from("products")
          .select("id, name, store_id, stock_qty, min_stock, unit, track_stock, active")
          .in("store_id", ids),
        supabase
          .from("receivables")
          .select("store_id, amount_cents, due_date, received, received_at")
          .in("store_id", ids)
          .gte("due_date", start.slice(0, 10))
          .lte("due_date", end.slice(0, 10)),
        supabase
          .from("receivables")
          .select("amount_cents, due_date, received, received_at")
          .in("store_id", ids)
          .gte("due_date", prev.start.toISOString().slice(0, 10))
          .lte("due_date", prev.end.toISOString().slice(0, 10)),
      ]);
      if (pay.error) throw pay.error;
      if (receivables.error) throw receivables.error;
      return {
        pagamentos: pay.data ?? [],
        anterior: payPrev.data ?? [],
        tabs: tabs.data ?? [],
        itens: items.data ?? [],
        despesas: expenses.data ?? [],
        despesasAnt: expensesPrev.data ?? [],
        produtos: products.data ?? [],
        recebiveis: receivables.data ?? [],
        recebiveisAnt: receivablesPrev.data ?? [],
      };
    },
  });

  /** contas financeiras lançadas/baixadas refletem no BI em tempo real */
  useEffect(() => {
    const ch = supabase
      .channel("bi-geral-financeiro")
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, () => {
        qc.invalidateQueries({ queryKey: ["bi-geral"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "receivables" }, () => {
        qc.invalidateQueries({ queryKey: ["bi-geral"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc]);

  const pagamentos = data?.pagamentos ?? [];
  const anterior = data?.anterior ?? [];
  const tabs = data?.tabs ?? [];
  const itens = data?.itens ?? [];
  const despesas = data?.despesas ?? [];
  const despesasAnt = data?.despesasAnt ?? [];
  const produtos = data?.produtos ?? [];
  const recebiveis = data?.recebiveis ?? [];
  const recebiveisAnt = data?.recebiveisAnt ?? [];

  const nome = (id: string | null) => lojas.find((s) => s.id === id)?.name ?? "Loja";

  const receita = sum(pagamentos, (p) => p.amount_cents);
  const receitaAnt = sum(anterior, (p) => p.amount_cents);
  const despesaTotal = sum(despesas, (d) => d.amount_cents);
  const despesaAnt = sum(despesasAnt, (d) => d.amount_cents);
  const resultado = receita - despesaTotal;
  const pedidos = tabs.length;
  const ticket = pedidos ? receita / pedidos : 0;
  const taxas = sum(tabs, (t) => t.delivery_fee_cents ?? 0);
  const emAberto = sum(despesas.filter((d) => !d.paid), (d) => d.amount_cents);
  const aReceber = sum(recebiveis.filter((r) => !r.received), (r) => r.amount_cents);
  const aReceberAnt = sum(recebiveisAnt.filter((r) => !r.received), (r) => r.amount_cents);
  const recebido = sum(recebiveis.filter((r) => r.received), (r) => r.amount_cents);
  const recebidoAnt = sum(recebiveisAnt.filter((r) => r.received), (r) => r.amount_cents);
  const estoqueCritico = produtos.filter(
    (p) => p.active && p.track_stock && Number(p.stock_qty) <= Number(p.min_stock),
  );
  const faltaPedido = estoqueCritico.reduce(
    (total, produto) => total + Math.max(0, Number(produto.min_stock) - Number(produto.stock_qty)),
    0,
  );

  const serie = compareSeries(
    period,
    range,
    pagamentos.map((p) => ({ date: p.paid_at, value: p.amount_cents })),
    anterior.map((p) => ({ date: p.paid_at, value: p.amount_cents })),
  );

  const porLoja = groupSum(pagamentos, (p) => nome(p.store_id), (p) => p.amount_cents);
  const porLojaAnt = new Map(
    groupSum(anterior, (p) => nome(p.store_id), (p) => p.amount_cents)
      .map((r) => [r.name, r.total] as const),
  );
  const porMetodo = groupSum(pagamentos, (p) => METODOS[p.method] ?? p.method, (p) => p.amount_cents);
  const porCanal = groupSum(tabs, (t) => CANAIS[t.kind] ?? t.kind, () => 1);
  const topProdutos = groupSum(itens, (i) => i.name, (i) => Number(i.quantity) * i.unit_price_cents).slice(0, 10);
  const despCategoria = groupSum(despesas, (d) => d.category, (d) => d.amount_cents).slice(0, 8);

  return (
    <div className="space-y-5">
      <BiToolbar
        period={period}
        setPeriod={setPeriod}
        offset={offset}
        setOffset={setOffset}
        range={range}
        right={toolbarRight}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={`Faturamento ${escopo}`} value={brl(receita)} deltaPct={delta(receita, receitaAnt)} />
        <KpiCard label="Despesas" value={brl(despesaTotal)} deltaPct={delta(despesaTotal, despesaAnt)} invert />
        <KpiCard label="Resultado" value={brl(resultado)} hint={receita ? `Margem ${((resultado / receita) * 100).toFixed(1)}%` : undefined} />
        <KpiCard label="Pedidos" value={String(pedidos)} hint={`Ticket médio ${brl(ticket)}`} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Taxas de entrega" value={brl(taxas)} />
        <KpiCard label="Contas em aberto" value={brl(emAberto)} invert />
        <KpiCard label="Produtos com estoque crítico" value={String(estoqueCritico.length)} invert hint={`Contagem ${escopo}`} />
        <KpiCard label="Lojas vendendo no período" value={String(porLoja.length)} hint={`${lojas.length} selecionada(s)`} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Contas a receber" value={brl(aReceber)} deltaPct={delta(aReceber, aReceberAnt)} />
        <KpiCard label="Recebido no período" value={brl(recebido)} deltaPct={delta(recebido, recebidoAnt)} />
        <KpiCard label="Falta para próximo pedido" value={String(faltaPedido)} invert hint="Unidades até o estoque mínimo" />
      </div>

      <ChartCard title="Alerta de estoque crítico" subtitle="Saldo atual e quantidade necessária para atingir o estoque mínimo">
        {estoqueCritico.length === 0 ? (
          <EmptyBi>Todos os produtos estão acima do estoque mínimo.</EmptyBi>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2">Loja</th>
                  <th className="py-2">Produto</th>
                  <th className="py-2 text-right">Saldo</th>
                  <th className="py-2 text-right">Mínimo</th>
                  <th className="py-2 text-right">Pedir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {estoqueCritico
                  .sort((a, b) => (Number(a.stock_qty) - Number(a.min_stock)) - (Number(b.stock_qty) - Number(b.min_stock)))
                  .map((produto) => {
                    const pedir = Math.max(0, Number(produto.min_stock) - Number(produto.stock_qty));
                    return (
                      <tr key={produto.id} className="bg-destructive/5">
                        <td className="py-2">{nome(produto.store_id)}</td>
                        <td className="py-2 font-semibold text-destructive">{produto.name}</td>
                        <td className="py-2 text-right">{Number(produto.stock_qty)} {produto.unit}</td>
                        <td className="py-2 text-right">{Number(produto.min_stock)} {produto.unit}</td>
                        <td className="py-2 text-right font-black text-destructive">{pedir} {produto.unit}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>

      <ChartCard title={`Faturamento ${escopo}`} subtitle="Atual x período anterior">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={serie}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="label" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip formatter={(v: number) => brl(Math.round(v * 100))} contentStyle={{ borderRadius: 12 }} />
            <Legend />
            <Line type="monotone" dataKey="atual" stroke={CHART_COLORS[0]} strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="anterior" stroke={CHART_COLORS[3]} strokeDasharray="5 4" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Ranking por loja">
          {porLoja.length === 0 ? (
            <EmptyBi />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={porLoja.map((l) => ({ ...l, total: l.total / 100 }))} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis type="number" fontSize={11} />
                  <YAxis type="category" dataKey="name" fontSize={11} width={130} />
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
                      <span className={"w-20 text-right text-xs font-semibold " + (d == null ? "text-muted-foreground" : d >= 0 ? "text-chart-2" : "text-destructive")}>
                        {d == null ? "—" : `${d > 0 ? "+" : ""}${d.toFixed(1)}%`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </ChartCard>

        <ChartCard title="Pedidos por canal">
          {porCanal.length === 0 ? (
            <EmptyBi />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={porCanal.map((c) => ({ ...c }))}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 12 }} />
                <Bar dataKey="total" name="Pedidos" radius={[6, 6, 0, 0]}>
                  {porCanal.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Formas de pagamento">
          {porMetodo.length === 0 ? (
            <EmptyBi />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={porMetodo} dataKey="total" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                  {porMetodo.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => brl(Math.round(v))} contentStyle={{ borderRadius: 12 }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Despesas por categoria">
          {despCategoria.length === 0 ? (
            <EmptyBi />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={despCategoria} dataKey="total" nameKey="name" outerRadius={100} paddingAngle={2}>
                  {despCategoria.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => brl(Math.round(v))} contentStyle={{ borderRadius: 12 }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <ChartCard title={`Top 10 produtos ${escopo}`} subtitle="Por valor vendido no período">
        {topProdutos.length === 0 ? (
          <EmptyBi />
        ) : (
          <div className="divide-y divide-border">
            {topProdutos.map((p, i) => (
              <div key={p.name} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-6 text-center font-bold text-muted-foreground">{i + 1}</span>
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
