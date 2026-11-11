import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid } from "recharts";
import { ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId } from "@/lib/store";
import { brl } from "@/lib/format";
import { downloadCSV, exportTablePDF, periodSince } from "@/lib/reports";
import { ReportCard, ReportStats, ReportToolbar } from "@/features/report-kit";

export function ReportFuncionarios() {
  const [days, setDays] = useState("30");
  const since = periodSince(Number(days)).toISOString();
  const sid = currentStoreId();
  const { data: emp = [] } = useQuery({
    queryKey: ["rf-emp", sid],
    queryFn: async () => {
      const r = await supabase.from("employees").select("id,name,job_title,commission_pct,base_salary_cents,active").eq("store_id", sid).order("name");
      if (r.error) throw r.error;
      return r.data ?? [];
    },
  });
  const { data: tabs = [] } = useQuery({
    queryKey: ["rf-tabs", days, sid],
    queryFn: async () => {
      const r = await supabase.from("tabs").select("id,employee_id,status,closed_at").eq("store_id", sid).eq("status", "closed").gte("closed_at", since).limit(3000);
      if (r.error) throw r.error;
      return r.data ?? [];
    },
  });
  const { data: pay = [] } = useQuery({
    queryKey: ["rf-pay", days, sid],
    queryFn: async () => {
      const r = await supabase.from("payments").select("tab_id,amount_cents").eq("store_id", sid).gte("paid_at", since).limit(5000);
      if (r.error) throw r.error;
      return r.data ?? [];
    },
  });
  const byTab = new Map<string, number>();
  for (const p of pay as any[]) {
    if (!p.tab_id) continue;
    byTab.set(p.tab_id, (byTab.get(p.tab_id) ?? 0) + Number(p.amount_cents || 0));
  }
  const rows = (emp as any[]).map((e) => {
    const own = (tabs as any[]).filter((t) => t.employee_id === e.id);
    const total = own.reduce((s: number, t: any) => s + (byTab.get(t.id) ?? 0), 0);
    const pct = Number(e.commission_pct || 0);
    return { id: e.id, name: e.name, job: e.job_title, n: own.length, total, com: Math.round((total * pct) / 100), base: Number(e.base_salary_cents || 0), pct };
  }).sort((a, b) => b.total - a.total);
  const totV = rows.reduce((s, r) => s + r.total, 0);
  const totC = rows.reduce((s, r) => s + r.com, 0);
  const totF = rows.reduce((s, r) => s + r.base + r.com, 0);
  return (
    <div className="space-y-4">
      <ReportToolbar days={days} onDays={setDays} title="Relatório da equipe"
        onExportCSV={() => downloadCSV(`equipe-${days}d.csv`, ["Funcionario", "Cargo", "Comandas", "Vendas R$", "Comissao R$"], rows.map((r) => [r.name, r.job, r.n, (r.total / 100).toFixed(2).replace(".", ","), (r.com / 100).toFixed(2).replace(".", ",")]))}
        onExportPDF={() => exportTablePDF("Relatório da equipe", `Vendas ${brl(totV)} · Comissões ${brl(totC)} · Folha ${brl(totF)}`, ["Funcionário", "Vendas", "Comissão", "Base + comissão"], rows.map((r) => [r.name, brl(r.total), brl(r.com), brl(r.base + r.com)]), `equipe-${days}d.pdf`)}
      />
      <ReportStats items={[
        { label: "Vendas da equipe", value: brl(totV) },
        { label: "Comissões", value: brl(totC) },
        { label: "Folha (base + comissão)", value: brl(totF) },
        { label: "Ativos", value: String((emp as any[]).filter((e) => e.active).length) },
      ]} />
      <ReportCard title="Vendas por funcionário" empty={rows.every((r) => r.total === 0)}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
            <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" fontSize={11} width={130} tickLine={false} axisLine={false} />
            <Tooltip formatter={(v: number) => brl(Math.round(v * 100))} />
            <Bar dataKey="total" fill="var(--chart-1)" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ReportCard>
    </div>
  );
}
