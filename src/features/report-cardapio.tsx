import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid } from "recharts";
import { ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId } from "@/lib/store";
import { brl } from "@/lib/format";
import { downloadCSV, exportTablePDF, periodSince } from "@/lib/reports";
import { ReportCard, ReportStats, ReportToolbar } from "@/features/report-kit";

export function ReportCardapio() {
  const [days, setDays] = useState("30");
  const since = periodSince(Number(days)).toISOString();
  const sid = currentStoreId();
  const q = async (t: string, sel: string) => {
    const r = await supabase.from(t as never).select(sel as never)
      .eq("store_id" as never, sid as never);
    if ((r as any).error) throw (r as any).error;
    return (r as any).data ?? [];
  };
  const { data: prods = [] } = useQuery({
    queryKey: ["rm-prods", sid],
    queryFn: () => q("products", "id,name,category_id,price_cents,active"),
  });
  const { data: cats = [] } = useQuery({
    queryKey: ["rm-cats", sid], queryFn: () => q("categories", "id,name"),
  });
  const { data: items = [] } = useQuery({
    queryKey: ["rm-items", days, sid],
    queryFn: async () => {
      const r = await supabase.from("tab_items").select("name,quantity,unit_price_cents")
        .eq("store_id", sid).gte("created_at", since).limit(5000);
      if (r.error) throw r.error;
      return r.data ?? [];
    },
  });
  const mix = new Map<string, { name: string; qty: number; value: number }>();
  for (const i of items as any[]) {
    const c = mix.get(i.name) ?? { name: i.name, qty: 0, value: 0 };
    c.qty += Number(i.quantity || 0);
    c.value += Number(i.quantity || 0) * Number(i.unit_price_cents || 0);
    mix.set(i.name, c);
  }
  const rows = [...mix.values()].sort((a, b) => b.value - a.value);
  const catName = (n: string) => {
    const p = (prods as any[]).find((x) => x.name === n);
    return (cats as any[]).find((c) => c.id === p?.category_id)?.name ?? "Sem categoria";
  };
  const byCat = new Map<string, number>();
  for (const r of rows) byCat.set(catName(r.name), (byCat.get(catName(r.name)) ?? 0) + r.value);
  const catData = [...byCat.entries()].map(([name, v]) => ({ name, valor: v / 100 }))
    .sort((a, b) => b.valor - a.valor).slice(0, 8);
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <div className="space-y-4">
      <ReportToolbar days={days} onDays={setDays} title="Relatório do menu digital"
        onExportCSV={() => downloadCSV(`cardapio-${days}d.csv`, ["Item", "Qtd", "Total R$"],
          rows.map((r) => [r.name, r.qty, (r.value / 100).toFixed(2).replace(".", ",")]))}
        onExportPDF={() => exportTablePDF("Relatório do cardápio", `Faturamento ${brl(total)} no período`,
          ["Item", "Categoria", "Qtd", "Total"], rows.slice(0, 60).map((r) => [r.name, catName(r.name), r.qty, brl(r.value)]), `cardapio-${days}d.pdf`)}
      />
      <ReportStats items={[
        { label: "Itens ativos", value: String((prods as any[]).filter((p) => p.active).length) },
        { label: "Faturamento", value: brl(total) },
        { label: "Itens vendidos", value: String(rows.reduce((s, r) => s + r.qty, 0)) },
        { label: "Categorias", value: String((cats as any[]).length) },
      ]} />
      <ReportCard title="Faturamento por categoria" empty={catData.length === 0}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={catData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
            <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" fontSize={11} width={130} tickLine={false} axisLine={false} />
            <Tooltip formatter={(v: number) => brl(Math.round(v * 100))} />
            <Bar dataKey="valor" fill="var(--chart-4)" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ReportCard>
    </div>
  );
}
