import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { HandCoins, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId } from "@/lib/store";
import { brl, dateTime } from "@/lib/format";
import { IconTile } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ComissoesEquipe() {
  const [days, setDays] = useState("30");
  const since = new Date(Date.now() - (Number(days) - 1) * 86400000);
  since.setHours(0, 0, 0, 0);
  const sinceISO = since.toISOString();

  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("store_id", currentStoreId())
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: tabs = [] } = useQuery({
    queryKey: ["comissoes", "tabs", days],
    refetchInterval: 20000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tabs")
        .select("id, name, employee_id, closed_at, status")
        .eq("store_id", currentStoreId())
        .eq("status", "closed")
        .gte("closed_at", sinceISO)
        .order("closed_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["comissoes", "payments", days],
    refetchInterval: 20000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("tab_id, amount_cents, paid_at, method")
        .eq("store_id", currentStoreId())
        .gte("paid_at", sinceISO);
      if (error) throw error;
      return data;
    },
  });

  const totalByTab = new Map<string, number>();
  for (const p of payments) {
    if (!p.tab_id) continue;
    totalByTab.set(p.tab_id, (totalByTab.get(p.tab_id) ?? 0) + Number(p.amount_cents));
  }

  const rows = employees.map((e) => {
    const own = tabs.filter((t) => t.employee_id === e.id);
    const total = own.reduce((s, t) => s + (totalByTab.get(t.id) ?? 0), 0);
    const pct = Number(e.commission_pct ?? 0);
    return {
      id: e.id,
      name: e.name,
      job: e.job_title,
      pct,
      tabs: own.length,
      total,
      ticket: own.length ? Math.round(total / own.length) : 0,
      commission: Math.round((total * pct) / 100),
      list: own,
    };
  });

  const semGarcom = tabs.filter((t) => !t.employee_id);
  const semGarcomTotal = semGarcom.reduce((s, t) => s + (totalByTab.get(t.id) ?? 0), 0);

  const totalSales = rows.reduce((s, r) => s + r.total, 0);
  const totalCommission = rows.reduce((s, r) => s + r.commission, 0);

  const exportCsv = () => {
    const header = "Funcionario;Cargo;Comandas;Total vendido;Ticket medio;% Comissao;Comissao\n";
    const body = rows
      .map((r) =>
        [
          r.name,
          r.job,
          r.tabs,
          (r.total / 100).toFixed(2),
          (r.ticket / 100).toFixed(2),
          r.pct.toFixed(2),
          (r.commission / 100).toFixed(2),
        ].join(";"),
      )
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([header + body], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `comissoes-${days}dias.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44 space-y-2">
          <Label>Período</Label>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="15">Últimos 15 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="secondary" onClick={exportCsv} disabled={rows.length === 0}>
          <Download className="mr-2 size-4" />
          Exportar CSV
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Vendas com garçom", value: brl(totalSales) },
          { label: "Comissões a pagar", value: brl(totalCommission) },
          { label: "Comandas atribuídas", value: String(tabs.length - semGarcom.length) },
          { label: "Sem garçom", value: brl(semGarcomTotal) },
        ].map((c) => (
          <div key={c.label} className="card-surface p-5">
            <p className="text-xs font-semibold text-muted-foreground">{c.label}</p>
            <p className="mt-1 text-2xl font-black">{c.value}</p>
          </div>
        ))}
      </div>

      {rows.some((r) => r.total > 0) && (
        <div className="card-surface p-5">
          <h3 className="mb-4 font-bold">Vendas por funcionário</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows.map((r) => ({ name: r.name, vendas: r.total / 100, comissao: r.commission / 100 }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => brl(Math.round(v * 100))} />
                <Bar dataKey="vendas" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="comissao" fill="var(--chart-3)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="card-surface">
        <div className="flex items-center gap-3 border-b border-border px-5 py-3">
          <IconTile icon={HandCoins} tone="bg-chart-3/15 text-chart-3" />
          <h3 className="font-bold">Comissão por funcionário</h3>
        </div>
        <div className="divide-y divide-border">
          {rows.length === 0 && (
            <p className="p-10 text-center text-sm text-muted-foreground">
              Cadastre funcionários e atribua o garçom nas comandas.
            </p>
          )}
          {rows.map((r) => (
            <details key={r.id} className="px-5 py-3">
              <summary className="flex cursor-pointer flex-wrap items-center gap-3">
                <div>
                  <p className="font-semibold">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.job} · {r.tabs} comandas · ticket {brl(r.ticket)}
                  </p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-xs text-muted-foreground">
                    Vendeu {brl(r.total)} · {r.pct}%
                  </p>
                  <p className="text-base font-black text-chart-3">{brl(r.commission)}</p>
                </div>
              </summary>
              <ul className="mt-3 space-y-1 border-t border-border pt-3">
                {r.list.length === 0 && (
                  <li className="text-xs text-muted-foreground">
                    Nenhuma comanda no período.
                  </li>
                )}
                {r.list.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 text-xs">
                    <span className="font-semibold">{t.name}</span>
                    <span className="text-muted-foreground">
                      {t.closed_at ? dateTime(t.closed_at) : ""}
                    </span>
                    <span className="ml-auto font-bold">
                      {brl(totalByTab.get(t.id) ?? 0)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
