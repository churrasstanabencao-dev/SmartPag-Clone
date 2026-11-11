import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart } from "recharts";
import { ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId } from "@/lib/store";
import { brl } from "@/lib/format";
import { PAYMENT_METHODS } from "@/lib/smartpag";
import { dayKeyOf, downloadCSV, exportTablePDF, lastNDays, periodSince } from "@/lib/reports";
import { ReportCard, ReportStats, ReportToolbar } from "@/features/report-kit";

export function ReportPdv() {
  const [days, setDays] = useState("30");
  const n = Number(days);
  const since = periodSince(n).toISOString();
  const buckets = useMemo(() => lastNDays(n), [n]);
  const sid = currentStoreId();
  const { data: pay = [] } = useQuery({
    queryKey: ["rp-pay", days, sid],
    queryFn: async () => {
      const r = await supabase.from("payments").select("amount_cents,method,paid_at")
        .eq("store_id", sid).gte("paid_at", since).limit(5000);
      if (r.error) throw r.error;
      return r.data ?? [];
    },
  });
  const { data: tabs = [] } = useQuery({
    queryKey: ["rp-tabs", days, sid],
    queryFn: async () => {
      const r = await supabase.from("tabs").select("id,kind,status,opened_at")
        .eq("store_id", sid).gte("opened_at", since).limit(2000);
      if (r.error) throw r.error;
      return r.data ?? [];
    },
  });
  const { data: items = [] } = useQuery({
    queryKey: ["rp-items", days, sid],
    queryFn: async () => {
      const r = await supabase.from("tab_items").select("name,quantity,unit_price_cents")
        .eq("store_id", sid).gte("created_at", since).limit(5000);
      if (r.error) throw r.error;
      return r.data ?? [];
    },
  });
  const total = pay.reduce((s: number, p: any) => s + Number(p.amount_cents || 0), 0);
  const closed = tabs.filter((t: any) => t.status === "closed").length;
  const ticket = closed ? Math.round(total / closed) : 0;
  const byDay = buckets.map((b) => ({
    dia: b.label,
    vendas: pay.filter((p: any) => dayKeyOf(p.paid_at) === b.key)
      .reduce((s: number, p: any) => s + Number(p.amount_cents || 0), 0) / 100,
  }));
  const byMethod = PAYMENT_METHODS.map((m) => ({
    name: m.label,
    value: pay.filter((p: any) => p.method === m.id)
      .reduce((s: number, p: any) => s + Number(p.amount_cents || 0), 0),
    color: m.chart,
  })).filter((m) => m.value > 0);
  const map = new Map<string, { name: string; qty: number; value: number }>();
  for (const i of items as any[]) {
    const c = map.get(i.name) ?? { name: i.name, qty: 0, value: 0 };
    c.qty += Number(i.quantity || 0);
    c.value += Number(i.quantity || 0) * Number(i.unit_price_cents || 0);
    map.set(i.name, c);
  }
  const top = [...map.values()].sort((a, b) => b.value - a.value).slice(0, 10);
  return (
    <div className="space-y-4">
      <ReportToolbar days={days} onDays={setDays} title="Relatório do PDV"
        onExportCSV={() => downloadCSV(`pdv-${days}d.csv`, ["Dia", "Vendas R$"],
          byDay.map((d) => [d.dia, d.vendas.toFixed(2).replace(".", ",")]))}
        onExportPDF={() => exportTablePDF("Relatório do PDV",
          `Últimos ${days} dias · ${brl(total)} · ticket ${brl(ticket)}`,
          ["Produto", "Qtd", "Total"], top.map((t) => [t.name, t.qty, brl(t.value)]), `pdv-${days}d.pdf`)}
      />
      <ReportStats items={[
        { label: "Faturamento", value: brl(total) },
        { label: "Comandas", value: String(tabs.length), hint: `${closed} fechadas` },
        { label: "Ticket médio", value: brl(ticket) },
        { label: "Itens vendidos", value: String((items as any[]).reduce((s: number, i: any) => s + Number(i.quantity || 0), 0)) },
      ]} />
      <div className="grid gap-4 lg:grid-cols-2">
        <ReportCard title="Vendas por dia" empty={total === 0}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byDay}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="dia" fontSize={11} tickLine={false} axisLine={false} interval={Math.max(0, Math.ceil(byDay.length / 12) - 1)} />
              <YAxis fontSize={11} tickLine={false} axisLine={false} width={56} />
              <Tooltip formatter={(v: number) => brl(Math.round(v * 100))} />
              <Bar dataKey="vendas" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ReportCard>
        <ReportCard title="Por pagamento" empty={byMethod.length === 0}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={byMethod} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                {byMethod.map((m, i) => <Cell key={i} fill={m.color} />)}
              </Pie>
              <Tooltip formatter={(v: number) => brl(Number(v))} />
            </PieChart>
          </ResponsiveContainer>
        </ReportCard>
      </div>
    </div>
  );
}
