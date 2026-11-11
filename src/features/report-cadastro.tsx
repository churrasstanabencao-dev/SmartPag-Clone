import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart } from "recharts";
import { ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId } from "@/lib/store";
import { brl } from "@/lib/format";
import { downloadCSV, exportTablePDF, periodSince } from "@/lib/reports";
import { ReportCard, ReportStats, ReportToolbar } from "@/features/report-kit";

export function ReportCadastro() {
  const [days, setDays] = useState("30");
  const since = periodSince(Number(days)).toISOString();
  const sid = currentStoreId();
  const { data: prods = [] } = useQuery({
    queryKey: ["rc-prods", sid],
    queryFn: async () => {
      const r = await supabase.from("products").select("id,name,category_id,price_cents,cost_cents,active,track_stock,stock_qty").eq("store_id", sid).limit(2000);
      if (r.error) throw r.error;
      return r.data ?? [];
    },
  });
  const { data: cats = [] } = useQuery({
    queryKey: ["rc-cats", sid],
    queryFn: async () => {
      const r = await supabase.from("categories").select("id,name").eq("store_id", sid).limit(200);
      if (r.error) throw r.error;
      return r.data ?? [];
    },
  });
  const { data: items = [] } = useQuery({
    queryKey: ["rc-items", days, sid],
    queryFn: async () => {
      const r = await supabase.from("tab_items").select("name,quantity,unit_price_cents").eq("store_id", sid).gte("created_at", since).limit(5000);
      if (r.error) throw r.error;
      return r.data ?? [];
    },
  });
  const { data: supp = [] } = useQuery({
    queryKey: ["rc-supp", sid],
    queryFn: async () => {
      const r = await supabase.from("suppliers").select("id,active").eq("store_id", sid).limit(500);
      if (r.error) throw r.error;
      return r.data ?? [];
    },
  });
  const { data: cust = [] } = useQuery({
    queryKey: ["rc-cust", sid],
    queryFn: async () => {
      const r = await supabase.from("customers").select("id").eq("store_id", sid).limit(2000);
      if (r.error) throw r.error;
      return r.data ?? [];
    },
  });
  const catName = (id: string | null) => (cats as any[]).find((c) => c.id === id)?.name ?? "Sem categoria";
  const byCat = new Map<string, number>();
  for (const p of prods as any[]) {
    const k = catName(p.category_id);
    byCat.set(k, (byCat.get(k) ?? 0) + 1);
  }
  const catData = [...byCat.entries()].map(([name, qtd], i) => ({ name, qtd, color: `var(--chart-${(i % 7) + 1})` }));
  const mix = new Map<string, { name: string; qty: number; value: number }>();
  for (const i of items as any[]) {
    const c = mix.get(i.name) ?? { name: i.name, qty: 0, value: 0 };
    c.qty += Number(i.quantity || 0);
    c.value += Number(i.quantity || 0) * Number(i.unit_price_cents || 0);
    mix.set(i.name, c);
  }
  const top = [...mix.values()].sort((a, b) => b.qty - a.qty).slice(0, 10);
  const ativos = (prods as any[]).filter((p) => p.active).length;
  const margem = (prods as any[]).filter((p) => Number(p.price_cents) > 0 && Number(p.cost_cents) > 0);
  const margMedia = margem.length ? margem.reduce((s: number, p: any) => s + (Number(p.price_cents) - Number(p.cost_cents)) / Number(p.price_cents), 0) / margem.length : 0;
  return (
    <div className="space-y-4">
      <ReportToolbar days={days} onDays={setDays} title="Relatório de cadastros e mix"
        onExportCSV={() => downloadCSV(`cadastro-${days}d.csv`, ["Produto", "Qtd", "Total R$"], top.map((t) => [t.name, t.qty, t.value.toFixed(2).replace(".", ",")]))}
        onExportPDF={() => exportTablePDF("Relatório de cadastros", `${prods.length} produtos · ${ativos} ativos · margem média ${(margMedia * 100).toFixed(1)}%`, ["Produto", "Categoria", "Preço"], (prods as any[]).slice(0, 100).map((p) => [p.name, catName(p.category_id), brl(Number(p.price_cents || 0))]), `cadastro.pdf`)}
      />
      <ReportStats items={[
        { label: "Produtos", value: String(prods.length), hint: `${ativos} ativos` },
        { label: "Categorias", value: String(cats.length) },
        { label: "Margem média", value: `${(margMedia * 100).toFixed(1).replace(".", ",")}%` },
        { label: "Fornecedores / clientes", value: `${supp.length} / ${cust.length}` },
      ]} />
      <div className="grid gap-4 lg:grid-cols-2">
        <ReportCard title="Produtos por categoria" empty={catData.length === 0}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={catData} dataKey="qtd" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                {catData.map((c, i) => <Cell key={i} fill={c.color} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ReportCard>
        <ReportCard title="Mais vendidos (qtd)" empty={top.length === 0}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={top} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
              <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" fontSize={11} width={130} tickLine={false} axisLine={false} />
              <Tooltip />
              <Bar dataKey="qty" fill="var(--chart-2)" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ReportCard>
      </div>
    </div>
  );
}
