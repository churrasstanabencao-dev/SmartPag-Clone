import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@/lib/store";
import { BiGeral } from "@/features/bi-geral";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";

/** BI com os mesmos indicadores da rede, porém restrito a uma única loja. */
export function BiLoja() {
  const { stores, networkStores, storeId } = useStore();
  const lojas = (networkStores?.length ? networkStores : stores) ?? [];
  const [selecionada, setSelecionada] = useState<string>("");

  useEffect(() => {
    if (!selecionada) {
      const inicial = storeId ?? lojas[0]?.id ?? "";
      if (inicial) setSelecionada(inicial);
    }
  }, [storeId, lojas, selecionada]);

  const seletor = (
    <label className="flex items-center gap-2 text-sm font-semibold">
      <span className="text-muted-foreground">Loja</span>
      <select
        value={selecionada}
        onChange={(e) => setSelecionada(e.target.value)}
        className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-semibold"
      >
        {lojas.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );

  if (!selecionada) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Selecione uma loja.</p>;
  }

  return (
    <div className="space-y-6">
      <BiGeral
        key={selecionada}
        storeIds={[selecionada]}
        escopo="da loja"
        toolbarRight={seletor}
      />
      <ContasPagarPorLoja lojas={lojas} selecionada={selecionada} />
    </div>
  );
}

/** Contas a pagar por loja: em aberto, vencidas e já pagas. */
function ContasPagarPorLoja({
  lojas,
  selecionada,
}: {
  lojas: { id: string; name: string }[];
  selecionada: string;
}) {
  const ids = lojas.map((l) => l.id);

  const { data: despesas = [] } = useQuery({
    queryKey: ["bi-loja-contas", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("store_id, amount_cents, due_date, paid")
        .in("store_id", ids);
      if (error) throw error;
      return data ?? [];
    },
  });

  const hj = new Date().toISOString().slice(0, 10);

  const linhas = useMemo(
    () =>
      lojas.map((l) => {
        const rows = despesas.filter((d) => d.store_id === l.id);
        const soma = (f: typeof rows) => f.reduce((s, d) => s + Number(d.amount_cents), 0);
        const abertas = rows.filter((d) => !d.paid);
        return {
          id: l.id,
          name: l.name,
          aberto: soma(abertas),
          vencidas: soma(abertas.filter((d) => String(d.due_date) < hj)),
          pago: soma(rows.filter((d) => d.paid)),
        };
      }),
    [lojas, despesas, hj],
  );

  const totais = linhas.reduce(
    (a, l) => ({
      aberto: a.aberto + l.aberto,
      vencidas: a.vencidas + l.vencidas,
      pago: a.pago + l.pago,
    }),
    { aberto: 0, vencidas: 0, pago: 0 },
  );

  return (
    <section className="card-surface p-5">
      <h2 className="text-lg font-bold">Contas a pagar por loja</h2>
      <p className="text-sm text-muted-foreground">
        Quanto cada loja ainda deve e quanto já foi pago.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-muted-foreground">
              <th className="py-2">Loja</th>
              <th className="py-2 text-right">Em aberto</th>
              <th className="py-2 text-right">Vencidas</th>
              <th className="py-2 text-right">Já pago</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {linhas.map((l) => (
              <tr key={l.id} className={l.id === selecionada ? "bg-primary/5" : undefined}>
                <td className="py-2 font-semibold">{l.name}</td>
                <td className="py-2 text-right font-bold">{brl(l.aberto)}</td>
                <td className="py-2 text-right font-bold text-destructive">{brl(l.vencidas)}</td>
                <td className="py-2 text-right font-bold text-chart-2">{brl(l.pago)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border">
              <td className="py-2 font-black">Total</td>
              <td className="py-2 text-right font-black">{brl(totais.aberto)}</td>
              <td className="py-2 text-right font-black text-destructive">{brl(totais.vencidas)}</td>
              <td className="py-2 text-right font-black text-chart-2">{brl(totais.pago)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
