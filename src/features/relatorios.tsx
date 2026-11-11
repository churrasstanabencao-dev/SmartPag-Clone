import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId } from "@/lib/store";
import { brl } from "@/lib/format";
import { PAYMENT_METHODS, methodLabel } from "@/lib/smartpag";

export function RelatorioVendas() {
  const since = new Date(Date.now() - 13 * 86400000);
  since.setHours(0, 0, 0, 0);

  const { data: payments = [] } = useQuery({
    queryKey: ["payments", "14d"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("store_id", currentStoreId())
        .gte("paid_at", since.toISOString());
      if (error) throw error;
      return data;
    },
    refetchInterval: 15000,
  });

  const { data: items = [] } = useQuery({
    queryKey: ["tab_items", "14d"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tab_items")
        .select("*")
        .eq("store_id", currentStoreId())
        .gte("created_at", since.toISOString());
      if (error) throw error;
      return data;
    },
    refetchInterval: 15000,
  });

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(since.getTime() + i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const total = payments
      .filter((p) => p.paid_at.slice(0, 10) === key)
      .reduce((s, p) => s + Number(p.amount_cents), 0);
    return {
      dia: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      valor: total / 100,
    };
  });

  const total = payments.reduce((s, p) => s + Number(p.amount_cents), 0);

  const topProducts = Object.values(
    items.reduce<Record<string, { name: string; qty: number; value: number }>>(
      (acc, i) => {
        const key = i.name;
        acc[key] ??= { name: key, qty: 0, value: 0 };
        acc[key].qty += Number(i.quantity);
        acc[key].value += Number(i.quantity) * Number(i.unit_price_cents);
        return acc;
      },
      {},
    ),
  )
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="card-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold">Vendas — últimos 14 dias</h3>
          <span className="text-lg font-black">{brl(total)}</span>
        </div>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={days}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border)"
                vertical={false}
              />
              <XAxis dataKey="dia" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} width={48} />
              <Tooltip
                formatter={(v: number) => brl(v * 100)}
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                }}
              />
              <Bar dataKey="valor" fill="var(--chart-1)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card-surface">
          <h3 className="border-b border-border px-5 py-3 font-bold">
            Por forma de pagamento
          </h3>
          <div className="divide-y divide-border">
            {PAYMENT_METHODS.map((m) => {
              const value = payments
                .filter((p) => p.method === m.id)
                .reduce((s, p) => s + Number(p.amount_cents), 0);
              return (
                <div key={m.id} className="flex items-center gap-3 px-5 py-3">
                  <span className={`size-8 rounded-lg ${m.tone}`} />
                  <span className="font-semibold">{methodLabel(m.id)}</span>
                  <span className="ml-auto font-bold">{brl(value)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card-surface">
          <h3 className="border-b border-border px-5 py-3 font-bold">
            Produtos mais vendidos
          </h3>
          <div className="divide-y divide-border">
            {topProducts.length === 0 && (
              <p className="p-10 text-center text-sm text-muted-foreground">
                Ainda não há itens lançados no período.
              </p>
            )}
            {topProducts.map((p) => (
              <div key={p.name} className="flex items-center gap-3 px-5 py-3">
                <div>
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.qty} unidade(s)
                  </p>
                </div>
                <span className="ml-auto font-bold">{brl(p.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
