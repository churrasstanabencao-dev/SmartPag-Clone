import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart } from "recharts";
import { ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId } from "@/lib/store";
import { brl } from "@/lib/format";
import { dayKeyOf, downloadCSV, exportTablePDF, lastNDays, periodSince } from "@/lib/reports";
import { ReportCard, ReportStats, ReportToolbar } from "@/features/report-kit";

export function ReportFinanceiro() {
  const [days, setDays] = useState("30");
  const n = Number(days);
  const since = periodSince(n).toISOString();
  const buckets = useMemo(() => lastNDays(n), [n]);
  const sid = currentStoreId();
  const { data: pay = [] } = useQuery({
    queryKey: ["rf-pay", days, sid],
    queryFn: async () => {
      const r = await supabase.from("payments").select("amount_cents,paid_at")
        .eq("store_id", sid).gte("paid_at", since).limit(5000);
      if (r.error) throw r.error;
      return r.data ?? [];
    },
  });
  const { data: exp = [] } = useQuery({
    queryKey: ["rf-exp", days, sid],
    queryFn: async () => {
      const r = await supabase.from("expenses").select("description,category,amount_cents,due_date,paid")
        .eq("store_id", sid).gte("due_date", since.slice(0, 10)).limit(2000);
      if (r.error) throw r.error;
      return r.data ?? [];
    },
  });
  const receita = pay.reduce((s: number, p: any) => s + Number(p.amount_cents || 0), 0);
  const desp = exp.reduce((s: number, e: any) => s + Number(e.amount_cents || 0), 0);
  const pagas = exp.filter((e: any) => e.paid).reduce((s: number, e: any) => s + Number(e.amount_cents || 0), 0);
  const aberto = desp - pagas;
  const today = new Date().toISOString().slice(0, 10);
  const vencidas = exp.filter((e: any) => !e.paid && e.due_date < today);
  const flow = buckets.map((b) => ({
    dia: b.label,
    receita: pay.filter((p: any) => dayKeyOf(p.paid_at) === b.key)
      .reduce((s: number, p: any) => s + Number(p.amount_cents || 0), 0) / 100,
    despesa: exp.filter((e: any) => e.due_date === b.key)
      .reduce((s: number, e: any) => s + Number(e.amount_cents || 0), 0) / 100,
  }));
  const byCat = new Map<string, number>();
  for (const e of exp as any[]) byCat.set(e.category, (byCat.get(e.category) ?? 0) + Number(e.amount_cents || 0));
  const catData = [...byCat.entries()].map(([name, value], i) => ({
    name, value, color: `var(--chart-${(i % 7) + 1})`,
  })).sort((a, b) => b.value - a.value);
  return (
    <div className="space-y-4">
      <ReportToolbar days={days} onDays={setDays} title="Relatório financeiro"
        onExportCSV={() => downloadCSV(`financeiro-${days}d.csv`, ["Dia", "Receita R$", "Despesa R$"],
          flow.map((f) => [f.dia, f.receita.toFixed(2).replace(".", ","), f.despesa.toFixed(2).replace(".", ",")]))}
        onExportPDF={() => exportTablePDF("Relatório financeiro",
          `Receita ${brl(receita)} · Despesa ${brl(desp)} · Resultado ${brl(receita - desp)}`,
          ["Categoria", "Total"], catData.map((c) => [c.name, brl(c.value)]), `financeiro-${days}d.pdf`)}
      />
      <ReportStats items={[
        { label: "Receita", value: brl(receita) },
        { label: "Despesas", value: brl(desp), hint: `${brl(pagas)} pagas` },
        { label: "Resultado", value: brl(receita - desp) },
        { label: "Em aberto", value: brl(aberto), hint: `${vencidas.length} vencidas` },
      ]} />
      <div className="grid gap-4 lg:grid-cols-2">
        <ReportCard title="Receita x despesa por dia" empty={receita + desp === 0}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={flow}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="dia" fontSize={11} tickLine={false} axisLine={false} interval={Math.max(0, Math.ceil(flow.length / 12) - 1)} />
              <YAxis fontSize={11} tickLine={false} axisLine={false} width={56} />
              <Tooltip formatter={(v: number) => brl(Math.round(v * 100))} />
              <Bar dataKey="receita" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="despesa" fill="var(--chart-4)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ReportCard>
        <ReportCard title="Despesas por categoria" empty={catData.length === 0}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={catData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                {catData.map((c, i) => <Cell key={i} fill={c.color} />)}
              </Pie>
              <Tooltip formatter={(v: number) => brl(Number(v))} />
            </PieChart>
          </ResponsiveContainer>
        </ReportCard>
      </div>
    </div>
  );
}
