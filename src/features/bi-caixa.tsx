import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store";
import { brl, dateTime } from "@/lib/format";
import { methodLabel } from "@/lib/smartpag";
import { delta, groupSum } from "@/lib/bi";
import { BiToolbar, ChartCard, EmptyBi, KpiCard, useBiPeriod } from "@/components/bi/bi-kit";

/**
 * Caixa da rede: entradas (vendas + suprimentos), saídas (sangrias) e saldo,
 * atualizados em tempo real a cada pagamento — inclusive os do app do garçom.
 */
export function BiCaixa() {
  const qc = useQueryClient();
  const { stores, networkStores } = useStore();
  const lojas = (networkStores?.length ? networkStores : stores) ?? [];
  const ids = lojas.map((loja) => loja.id);
  const nomes = new Map(lojas.map((loja) => [loja.id, loja.name]));
  const { period, setPeriod, offset, setOffset, range, prev } = useBiPeriod("mes");

  useEffect(() => {
    const refresh = () => qc.invalidateQueries({ queryKey: ["bi-caixa"] });
    const channel = supabase
      .channel("bi-caixa-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_movements" }, refresh)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  const load = async (start: Date, end: Date) => {
    const [pay, mov] = await Promise.all([
      supabase
        .from("payments")
        .select("id, store_id, method, amount_cents, paid_at")
        .in("store_id", ids)
        .gte("paid_at", start.toISOString())
        .lte("paid_at", end.toISOString()),
      supabase
        .from("cash_movements")
        .select("id, store_id, kind, description, method, amount_cents, created_at")
        .in("store_id", ids)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString()),
    ]);
    if (pay.error) throw pay.error;
    if (mov.error) throw mov.error;
    return { pagamentos: pay.data ?? [], movimentos: mov.data ?? [] };
  };

  const { data } = useQuery({
    enabled: ids.length > 0,
    queryKey: ["bi-caixa", ids.join(","), period, offset],
    queryFn: () => load(range.start, range.end),
  });

  const { data: anterior } = useQuery({
    enabled: ids.length > 0,
    queryKey: ["bi-caixa", "anterior", ids.join(","), period, offset],
    queryFn: () => load(prev.start, prev.end),
  });

  const totais = (d?: { pagamentos: { amount_cents: number }[]; movimentos: { kind: string; amount_cents: number }[] }) => {
    const vendas = (d?.pagamentos ?? []).reduce((s, p) => s + Number(p.amount_cents), 0);
    const suprimentos = (d?.movimentos ?? [])
      .filter((m) => m.kind === "entrada")
      .reduce((s, m) => s + Number(m.amount_cents), 0);
    const saidas = (d?.movimentos ?? [])
      .filter((m) => m.kind === "saida")
      .reduce((s, m) => s + Number(m.amount_cents), 0);
    return { vendas, entradas: vendas + suprimentos, saidas, saldo: vendas + suprimentos - saidas };
  };

  const atual = totais(data);
  const base = totais(anterior);

  const porLoja = [...new Set([...(data?.pagamentos ?? []).map((p) => p.store_id), ...(data?.movimentos ?? []).map((m) => m.store_id)])]
    .filter((id): id is string => !!id)
    .map((id) => {
      const t = totais({
        pagamentos: (data?.pagamentos ?? []).filter((p) => p.store_id === id),
        movimentos: (data?.movimentos ?? []).filter((m) => m.store_id === id),
      });
      return { id, nome: nomes.get(id) ?? "Loja", ...t };
    })
    .sort((a, b) => b.saldo - a.saldo);

  const porForma = groupSum(
    data?.pagamentos ?? [],
    (p) => methodLabel(p.method),
    (p) => Number(p.amount_cents),
  );

  const historico = [
    ...(data?.pagamentos ?? []).map((p) => ({
      id: `p-${p.id}`,
      tipo: "entrada" as const,
      descricao: `Venda · ${methodLabel(p.method)}`,
      loja: nomes.get(p.store_id ?? "") ?? "—",
      valor: Number(p.amount_cents),
      quando: p.paid_at,
    })),
    ...(data?.movimentos ?? []).map((m) => ({
      id: `m-${m.id}`,
      tipo: (m.kind === "entrada" ? "entrada" : "saida") as "entrada" | "saida",
      descricao: m.description,
      loja: nomes.get(m.store_id ?? "") ?? "—",
      valor: Number(m.amount_cents),
      quando: m.created_at,
    })),
  ]
    .sort((a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime())
    .slice(0, 40);

  return (
    <div className="space-y-5">
      <BiToolbar
        period={period}
        setPeriod={setPeriod}
        offset={offset}
        setOffset={setOffset}
        range={range}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Entradas" value={brl(atual.entradas)} deltaPct={delta(atual.entradas, base.entradas)} />
        <KpiCard
          label="Saídas"
          value={brl(atual.saidas)}
          deltaPct={delta(atual.saidas, base.saidas)}
          invert
        />
        <KpiCard label="Saldo do caixa" value={brl(atual.saldo)} deltaPct={delta(atual.saldo, base.saldo)} />
        <KpiCard
          label="Vendas recebidas"
          value={brl(atual.vendas)}
          deltaPct={delta(atual.vendas, base.vendas)}
          hint={`${(data?.pagamentos ?? []).length} pagamento(s)`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Caixa por loja" subtitle="Entradas, saídas e saldo no período">
          {porLoja.length === 0 ? (
            <EmptyBi />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2">Loja</th>
                    <th className="py-2 text-right">Entradas</th>
                    <th className="py-2 text-right">Saídas</th>
                    <th className="py-2 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {porLoja.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2 font-semibold">{l.nome}</td>
                      <td className="py-2 text-right font-bold text-chart-2">{brl(l.entradas)}</td>
                      <td className="py-2 text-right font-bold text-destructive">{brl(l.saidas)}</td>
                      <td className="py-2 text-right font-black">{brl(l.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Entradas por forma de pagamento" subtitle="Somente vendas recebidas">
          {porForma.length === 0 ? (
            <EmptyBi />
          ) : (
            <div className="divide-y divide-border">
              {porForma.map((f) => (
                <div key={f.name} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-semibold">{f.name}</span>
                  <span className="font-bold">{brl(f.total)}</span>
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>

      <ChartCard title="Histórico do caixa" subtitle="Últimos 40 lançamentos do período">
        {historico.length === 0 ? (
          <EmptyBi />
        ) : (
          <div className="divide-y divide-border">
            {historico.map((h) => (
              <div key={h.id} className="flex items-center gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{h.descricao}</p>
                  <p className="text-xs text-muted-foreground">
                    {h.loja} · {dateTime(h.quando)}
                  </p>
                </div>
                <span
                  className={`ml-auto font-bold ${
                    h.tipo === "entrada" ? "text-chart-2" : "text-destructive"
                  }`}
                >
                  {h.tipo === "entrada" ? "+" : "-"}
                  {brl(h.valor)}
                </span>
              </div>
            ))}
          </div>
        )}
      </ChartCard>
    </div>
  );
}
