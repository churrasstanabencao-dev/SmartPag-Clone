import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store";
import { brl } from "@/lib/format";
import { CHART_COLORS } from "@/lib/bi";
import { BiToolbar, ChartCard, EmptyBi, KpiCard, useBiPeriod } from "@/components/bi/bi-kit";

/** Custos das vendas calculados pelo custo médio atual de cada produto. */
export function BiCustosVendas() {
  const { stores, networkStores } = useStore();
  const lojas = (networkStores?.length ? networkStores : stores) ?? [];
  const ids = lojas.map((loja) => loja.id);
  const { period, setPeriod, offset, setOffset, range } = useBiPeriod("mes");

  const { data } = useQuery({
    enabled: ids.length > 0,
    queryKey: ["bi-custos-vendas", ids.join(","), period, offset],
    queryFn: async () => {
      const [items, products] = await Promise.all([
        supabase
          .from("tab_items")
          .select("product_id, store_id, name, quantity, unit_price_cents, created_at")
          .in("store_id", ids)
          .gte("created_at", range.start.toISOString())
          .lte("created_at", range.end.toISOString()),
        supabase
          .from("products")
          .select("id, cost_cents")
          .in("store_id", ids),
      ]);
      if (items.error) throw items.error;
      if (products.error) throw products.error;
      return { items: items.data ?? [], products: products.data ?? [] };
    },
  });

  const custos = new Map((data?.products ?? []).map((produto) => [produto.id, Number(produto.cost_cents)]));
  const produtos = new Map<
    string,
    { name: string; quantidade: number; receita: number; custo: number; custoMedio: number }
  >();

  for (const item of data?.items ?? []) {
    const custoMedio = item.product_id ? (custos.get(item.product_id) ?? 0) : 0;
    const atual = produtos.get(item.name) ?? {
      name: item.name,
      quantidade: 0,
      receita: 0,
      custo: 0,
      custoMedio: 0,
    };
    atual.quantidade += Number(item.quantity);
    atual.receita += Number(item.quantity) * Number(item.unit_price_cents);
    atual.custo += Number(item.quantity) * custoMedio;
    atual.custoMedio = atual.quantidade ? atual.custo / atual.quantidade : 0;
    produtos.set(item.name, atual);
  }

  const linhas = [...produtos.values()]
    .map((produto) => ({
      ...produto,
      lucro: produto.receita - produto.custo,
      margem: produto.receita ? ((produto.receita - produto.custo) / produto.receita) * 100 : 0,
    }))
    .sort((a, b) => b.receita - a.receita);
  const receita = linhas.reduce((total, item) => total + item.receita, 0);
  const custo = linhas.reduce((total, item) => total + item.custo, 0);
  const lucro = receita - custo;
  const quantidade = linhas.reduce((total, item) => total + item.quantidade, 0);
  const margem = receita ? (lucro / receita) * 100 : 0;
  const custoMedioItem = quantidade ? custo / quantidade : 0;
  const grafico = linhas.slice(0, 10).map((item) => ({
    name: item.name,
    receita: item.receita / 100,
    custo: item.custo / 100,
  }));

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
        <KpiCard label="Receita dos itens" value={brl(receita)} />
        <KpiCard label="Custo das vendas" value={brl(custo)} invert />
        <KpiCard label="Lucro bruto" value={brl(lucro)} hint={`Margem ${margem.toFixed(1)}%`} />
        <KpiCard label="Custo médio por item" value={brl(custoMedioItem)} hint={`${quantidade} item(ns) vendido(s)`} />
      </div>

      <ChartCard title="Receita x custo por produto" subtitle="10 produtos com maior faturamento">
        {grafico.length === 0 ? (
          <EmptyBi />
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={grafico} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis type="number" fontSize={11} />
              <YAxis type="category" dataKey="name" fontSize={11} width={130} />
              <Tooltip formatter={(valor: number) => brl(Math.round(valor * 100))} />
              <Bar dataKey="receita" name="Receita" fill={CHART_COLORS[1]} radius={[0, 5, 5, 0]} />
              <Bar dataKey="custo" name="Custo" fill={CHART_COLORS[3]} radius={[0, 5, 5, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="Margem e custo médio por item">
        {linhas.length === 0 ? (
          <EmptyBi />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2">Produto</th>
                  <th className="py-2 text-right">Qtd.</th>
                  <th className="py-2 text-right">Receita</th>
                  <th className="py-2 text-right">Custo médio</th>
                  <th className="py-2 text-right">Custo vendido</th>
                  <th className="py-2 text-right">Lucro</th>
                  <th className="py-2 text-right">Margem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {linhas.map((item) => (
                  <tr key={item.name}>
                    <td className="py-2 font-semibold">{item.name}</td>
                    <td className="py-2 text-right">{item.quantidade}</td>
                    <td className="py-2 text-right">{brl(item.receita)}</td>
                    <td className="py-2 text-right">{brl(item.custoMedio)}</td>
                    <td className="py-2 text-right">{brl(item.custo)}</td>
                    <td className="py-2 text-right font-bold">{brl(item.lucro)}</td>
                    <td className="py-2 text-right font-bold">{item.margem.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
    </div>
  );
}
