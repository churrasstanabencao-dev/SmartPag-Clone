import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid } from "recharts";
import { ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId } from "@/lib/store";
import { brl } from "@/lib/format";
import { stockReasonLabel } from "@/lib/smartpag";
import { dayKeyOf, downloadCSV, exportTablePDF, lastNDays, periodSince } from "@/lib/reports";
import { ReportCard, ReportStats, ReportToolbar } from "@/features/report-kit";

export function ReportEstoque() {
  const [days, setDays] = useState("30");
  const n = Number(days);
  const since = periodSince(n).toISOString();
  const buckets = useMemo(() => lastNDays(n), [n]);
  const sid = currentStoreId();
  const { data: prods = [] } = useQuery({
    queryKey: ["re-products", sid],
    queryFn: async () => {
      const r = await supabase.from("products").select("id,name,stock_qty,min_stock,cost_cents,price_cents,track_stock,active")
        .eq("store_id", sid).order("name").limit(2000);
      if (r.error) throw r.error;
      return r.data ?? [];
    },
  });
  const { data: movs = [] } = useQuery({
    queryKey: ["re-movs", days, sid],
    queryFn: async () => {
      const r = await supabase.from("stock_movements").select("product_id,quantity,reason,created_at")
        .eq("store_id", sid).gte("created_at", since).limit(5000);
      if (r.error) throw r.error;
      return r.data ?? [];
    },
  });
  const { data: purch = [] } = useQuery({
    queryKey: ["re-purch", days, sid],
    queryFn: async () => {
      const r = await supabase.from("purchases").select("supplier,total_cents,issued_at,status")
        .eq("store_id", sid).gte("issued_at", since.slice(0, 10)).limit(500);
      if (r.error) throw r.error;
      return r.data ?? [];
    },
  });
  const tracked = (prods as any[]).filter((p) => p.track_stock);
  const stockVal = tracked.reduce((s: number, p: any) => s + Math.max(0, Number(p.stock_qty || 0)) * Number(p.cost_cents || 0), 0);
  const low = tracked.filter((p: any) => Number(p.stock_qty || 0) <= Number(p.min_stock || 0));
  const inQ = (movs as any[]).filter((m) => Number(m.quantity) > 0).reduce((s: number, m: any) => s + Number(m.quantity), 0);
  const outQ = (movs as any[]).filter((m) => Number(m.quantity) < 0).reduce((s: number, m: any) => s + Math.abs(Number(m.quantity)), 0);
  const flow = buckets.map((b) => ({
    dia: b.label,
    entradas: (movs as any[]).filter((m) => dayKeyOf(m.created_at) === b.key && Number(m.quantity) > 0)
      .reduce((s: number, m: any) => s + Number(m.quantity), 0),
    saidas: (movs as any[]).filter((m) => dayKeyOf(m.created_at) === b.key && Number(m.quantity) < 0)
      .reduce((s: number, m: any) => s + Math.abs(Number(m.quantity)), 0),
  }));
  const byReason = new Map<string, number>();
  for (const m of movs as any[]) {
    const k = stockReasonLabel(m.reason);
    byReason.set(k, (byReason.get(k) ?? 0) + Math.abs(Number(m.quantity || 0)));
  }
  const reasonData = [...byReason.entries()].map(([name, qtd]) => ({ name, qtd }))
    .sort((a, b) => b.qtd - a.qtd).slice(0, 8);
  const purchTotal = (purch as any[]).reduce((s: number, p: any) => s + Number(p.total_cents || 0), 0);
  return (
    <div className="space-y-4">
      <ReportToolbar days={days} onDays={setDays} title="Relatório de estoque e compras"
        onExportCSV={() => downloadCSV(`estoque-${days}d.csv`, ["Dia", "Entradas", "Saidas"],
          flow.map((f) => [f.dia, f.entradas, f.saidas]))}
        onExportPDF={() => exportTablePDF("Relatório de estoque",
          `Valor ${brl(stockVal)} · ${low.length} no mínimo · compras ${brl(purchTotal)}`,
          ["Produto", "Saldo", "Mínimo", "Valor"],
          (tracked as any[]).slice(0, 80).map((p) => [p.name, p.stock_qty, p.min_stock, brl(Math.max(0, Number(p.stock_qty || 0)) * Number(p.cost_cents || 0))]),
          `estoque-${days}d.pdf`)}
      />
      <ReportStats items={[
        { label: "Valor em estoque", value: brl(stockVal) },
        { label: "Abaixo do mínimo", value: String(low.length) },
        { label: "Entradas / saídas", value: `+${inQ} / -${outQ}` },
        { label: "Compras", value: brl(purchTotal), hint: `${purch.length} notas` },
      ]} />
      <div className="grid gap-4 lg:grid-cols-2">
        <ReportCard title="Movimento por dia" empty={movs.length === 0}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={flow}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="dia" fontSize={11} tickLine={false} axisLine={false} interval={Math.max(0, Math.ceil(flow.length / 12) - 1)} />
              <YAxis fontSize={11} tickLine={false} axisLine={false} width={48} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="entradas" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="saidas" fill="var(--chart-4)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ReportCard>
        <ReportCard title="Por motivo" empty={reasonData.length === 0}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={reasonData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
              <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" fontSize={11} width={130} tickLine={false} axisLine={false} />
              <Tooltip />
              <Bar dataKey="qtd" fill="var(--chart-1)" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ReportCard>
      </div>
    </div>
  );
}
