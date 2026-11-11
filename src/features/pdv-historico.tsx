import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  History,
  Printer,
  FileDown,
  Search,
  ShoppingCart,
  Utensils,
  Bike,
  Receipt,
  TrendingUp,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId } from "@/lib/store";
import { brl, dateTime } from "@/lib/format";
import { methodLabel, type PaymentMethod } from "@/lib/smartpag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const iso = (d: Date) => d.toISOString().slice(0, 10);

type Order = {
  id: string;
  code: number;
  name: string;
  kind: string;
  total: number;
  closedAt: string;
  customer: string;
  methods: string[];
};

/**
 * Histórico de pedidos com relatório de faturamento e de itens vendidos,
 * com impressão e exportação em PDF.
 */
export function HistoricoPedidos() {
  const today = iso(new Date());
  const [from, setFrom] = useState(
    iso(new Date(Date.now() - 6 * 86400000)),
  );
  const [to, setTo] = useState(today);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"historico" | "faturamento" | "itens">(
    "historico",
  );

  const range = useMemo(
    () => ({
      start: new Date(`${from}T00:00:00`).toISOString(),
      end: new Date(`${to}T23:59:59`).toISOString(),
    }),
    [from, to],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["historico_pedidos", range.start, range.end],
    queryFn: async () => {
      const store = currentStoreId();
      const { data: tabs, error } = await supabase
        .from("tabs")
        .select("id, name, kind, closed_at, customer_name, customer_phone")
        .eq("store_id", store)
        .eq("status", "closed")
        .gte("closed_at", range.start)
        .lte("closed_at", range.end)
        .order("closed_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const ids = (tabs ?? []).map((t) => t.id);

      const [{ data: items }, { data: pays }] = await Promise.all([
        ids.length
          ? supabase
              .from("tab_items")
              .select("tab_id, name, quantity, unit_price_cents")
              .in("tab_id", ids)
          : Promise.resolve({ data: [] as never[] }),
        ids.length
          ? supabase
              .from("payments")
              .select("tab_id, method, amount_cents")
              .in("tab_id", ids)
          : Promise.resolve({ data: [] as never[] }),
      ]);

      const totalByTab: Record<string, number> = {};
      for (const p of pays ?? [])
        totalByTab[p.tab_id ?? ""] =
          (totalByTab[p.tab_id ?? ""] ?? 0) + Number(p.amount_cents);
      const itemsByTab: Record<string, number> = {};
      for (const it of items ?? [])
        itemsByTab[it.tab_id] =
          (itemsByTab[it.tab_id] ?? 0) +
          Number(it.quantity) * Number(it.unit_price_cents);

      const methodsByTab: Record<string, string[]> = {};
      for (const p of pays ?? []) {
        const k = p.tab_id ?? "";
        methodsByTab[k] = [
          ...new Set([...(methodsByTab[k] ?? []), methodLabel(p.method as PaymentMethod)]),
        ];
      }

      const ordered = [...(tabs ?? [])].sort((a, b) =>
        (a.closed_at ?? "").localeCompare(b.closed_at ?? ""),
      );
      const codeByTab: Record<string, number> = {};
      ordered.forEach((t, i) => (codeByTab[t.id] = i + 1));

      const orders: Order[] = (tabs ?? []).map((t) => ({
        id: t.id,
        code: codeByTab[t.id] ?? 0,
        name: t.name,
        kind: t.kind,
        total: totalByTab[t.id] ?? itemsByTab[t.id] ?? 0,
        closedAt: t.closed_at ?? "",
        customer: [t.customer_name, t.customer_phone].filter(Boolean).join(" · "),
        methods: methodsByTab[t.id] ?? [],
      }));

      const payTotals: Record<string, number> = {};
      for (const p of pays ?? [])
        payTotals[p.method] = (payTotals[p.method] ?? 0) + Number(p.amount_cents);

      const productTotals: Record<string, { qty: number; value: number }> = {};
      for (const it of items ?? []) {
        const cur = productTotals[it.name] ?? { qty: 0, value: 0 };
        cur.qty += Number(it.quantity);
        cur.value += Number(it.quantity) * Number(it.unit_price_cents);
        productTotals[it.name] = cur;
      }

      return { orders, payTotals, productTotals };
    },
  });

  const orders = data?.orders ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) =>
      `${o.code} ${o.name} ${o.kind} ${o.customer}`.toLowerCase().includes(q),
    );
  }, [orders, query]);

  const total = filtered.reduce((s, o) => s + o.total, 0);
  const delivery = filtered
    .filter((o) => o.kind === "delivery")
    .reduce((s, o) => s + o.total, 0);
  const ticket = filtered.length ? Math.round(total / filtered.length) : 0;

  const byKind = useMemo(() => {
    const map: Record<string, { qty: number; total: number }> = {};
    for (const o of filtered) {
      const cur = map[o.kind] ?? { qty: 0, total: 0 };
      cur.qty += 1;
      cur.total += o.total;
      map[o.kind] = cur;
    }
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [filtered]);

  const payTotals = Object.entries(data?.payTotals ?? {}).sort(
    (a, b) => b[1] - a[1],
  );
  const payTotalSum = payTotals.reduce((s, [, v]) => s + v, 0);
  const products = Object.entries(data?.productTotals ?? {}).sort(
    (a, b) => b[1].qty - a[1].qty,
  );
  const itemsQty = products.reduce((s, [, v]) => s + v.qty, 0);

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "pt" });
    const period = `Período: ${from.split("-").reverse().join("/")} a ${to
      .split("-")
      .reverse()
      .join("/")}`;
    doc.setFontSize(16);
    doc.text(
      view === "faturamento"
        ? "Relatorio de faturamento"
        : view === "itens"
          ? "Relatorio de itens vendidos"
          : "Historico de pedidos",
      40,
      44,
    );
    doc.setFontSize(10);
    doc.text(period, 40, 62);

    if (view === "itens") {
      autoTable(doc, {
        startY: 80,
        head: [["Produto", "Quantidade", "Valor"]],
        body: products.map(([name, v]) => [name, String(v.qty), brl(v.value)]),
      });
    } else if (view === "faturamento") {
      autoTable(doc, {
        startY: 80,
        head: [["Indicador", "Valor"]],
        body: [
          ["Total vendido", brl(total)],
          ["Total em tele-entrega", brl(delivery)],
          ["Quantidade de pedidos", String(filtered.length)],
          ["Ticket medio", brl(ticket)],
        ],
      });
      autoTable(doc, {
        head: [["Tipo de pedido", "Quantidade", "Total", "Ticket medio"]],
        body: byKind.map(([k, v]) => [
          k,
          String(v.qty),
          brl(v.total),
          brl(Math.round(v.total / v.qty)),
        ]),
      });
      autoTable(doc, {
        head: [["Forma de pagamento", "Valor", "Percentual"]],
        body: payTotals.map(([m, v]) => [
          methodLabel(m as PaymentMethod),
          brl(v),
          payTotalSum ? `${Math.round((v / payTotalSum) * 100)}%` : "0%",
        ]),
      });
    } else {
      autoTable(doc, {
        startY: 80,
        head: [["Codigo", "Tipo", "Valor", "Data/horario", "Cliente"]],
        body: filtered.map((o) => [
          String(o.code),
          o.kind,
          brl(o.total),
          dateTime(o.closedAt),
          o.customer || "-",
        ]),
      });
    }
    doc.save(`${view}-${from}-a-${to}.pdf`);
  };

  const kindIcon = (kind: string) =>
    kind === "delivery" ? Bike : kind === "mesa" ? Utensils : ShoppingCart;

  return (
    <div className="space-y-4">
      <div className="card-surface grid gap-3 p-5 md:grid-cols-[repeat(2,150px)_minmax(0,1fr)_auto] md:items-end">
        <div className="space-y-2">
          <Label>De</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Até</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Pesquisar</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Código, tipo, cliente ou telefone"
            />
          </div>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" /> Imprimir
          </Button>
          <Button onClick={exportPdf}>
            <FileDown className="size-4" /> Exportar PDF
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 print:hidden">
        {([
          { id: "historico", label: "Histórico de pedidos", icon: History },
          { id: "faturamento", label: "Relatório de faturamento", icon: Receipt },
          { id: "itens", label: "Relatório itens vendidos", icon: TrendingUp },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${
              view === t.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="size-4" />
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="card-surface p-10 text-center text-sm text-muted-foreground">
          Carregando pedidos...
        </p>
      ) : view === "historico" ? (
        <div className="card-surface overflow-hidden">
          <h3 className="border-b border-border px-5 py-3 font-bold">
            Histórico de pedidos ({filtered.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Código</th>
                  <th className="px-5 py-3">Tipo de pedido</th>
                  <th className="px-5 py-3">Valor</th>
                  <th className="px-5 py-3">Data/horário</th>
                  <th className="px-5 py-3">Cliente/telefone</th>
                  <th className="px-5 py-3">Pagamento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((o) => {
                  const Icon = kindIcon(o.kind);
                  return (
                    <tr key={o.id} className="hover:bg-muted/40">
                      <td className="px-5 py-3 font-black">{o.code}</td>
                      <td className="px-5 py-3">
                        <span className="flex items-center gap-2 capitalize">
                          <Icon className="size-4 text-muted-foreground" />
                          {o.kind}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-bold">{brl(o.total)}</td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {dateTime(o.closedAt)}
                      </td>
                      <td className="px-5 py-3">{o.customer || "—"}</td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {o.methods.join(", ") || "—"}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="p-10 text-center text-sm text-muted-foreground"
                    >
                      Nenhum pedido no período selecionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : view === "faturamento" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card-surface divide-y divide-border p-5">
            <h3 className="pb-3 font-bold">Relatório de faturamento</h3>
            {[
              { label: "Total vendido", value: brl(total) },
              { label: "Total em tele-entrega", value: brl(delivery) },
              { label: "Quantidade de pedidos", value: String(filtered.length) },
              { label: "Ticket médio", value: brl(ticket) },
            ].map((r) => (
              <p key={r.label} className="flex items-center justify-between py-3">
                <span className="text-sm text-muted-foreground">{r.label}</span>
                <span className="font-black">{r.value}</span>
              </p>
            ))}
          </div>

          <div className="card-surface overflow-hidden">
            <h3 className="border-b border-border px-5 py-3 font-bold">
              Por tipo de pedido
            </h3>
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-2">Tipo</th>
                  <th className="px-5 py-2">Qtd</th>
                  <th className="px-5 py-2">Total</th>
                  <th className="px-5 py-2">Ticket</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {byKind.map(([k, v]) => (
                  <tr key={k}>
                    <td className="px-5 py-2 capitalize">{k}</td>
                    <td className="px-5 py-2">{v.qty}</td>
                    <td className="px-5 py-2 font-bold">{brl(v.total)}</td>
                    <td className="px-5 py-2">{brl(Math.round(v.total / v.qty))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card-surface overflow-hidden lg:col-span-2">
            <h3 className="border-b border-border px-5 py-3 font-bold">
              Totais por forma de pagamento
            </h3>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {payTotals.map(([m, v]) => {
                  const pct = payTotalSum ? Math.round((v / payTotalSum) * 100) : 0;
                  return (
                    <tr key={m}>
                      <td className="px-5 py-2">{methodLabel(m as PaymentMethod)}</td>
                      <td className="px-5 py-2 font-bold">{brl(v)}</td>
                      <td className="w-1/2 px-5 py-2">
                        <span className="flex items-center gap-2">
                          <span className="rounded-md bg-primary-soft px-2 py-0.5 text-xs font-bold text-primary">
                            {pct}%
                          </span>
                          <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <span
                              className="block h-full rounded-full bg-primary"
                              style={{ width: `${pct}%` }}
                            />
                          </span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-muted/40">
                  <td className="px-5 py-3 font-black">Total acumulado</td>
                  <td className="px-5 py-3 font-black" colSpan={2}>
                    {brl(payTotalSum)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="card-surface p-5">
              <p className="text-2xl font-black">{itemsQty}</p>
              <p className="text-sm text-muted-foreground">Quantidade de itens vendidos</p>
            </div>
            <div className="card-surface p-5">
              <p className="text-2xl font-black">{products.length}</p>
              <p className="text-sm text-muted-foreground">Produtos distintos</p>
            </div>
          </div>
          <div className="card-surface overflow-hidden">
            <h3 className="border-b border-border px-5 py-3 font-bold">
              Produtos vendidos
            </h3>
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-2">Produto</th>
                  <th className="px-5 py-2">Quantidade</th>
                  <th className="px-5 py-2">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {products.map(([name, v]) => (
                  <tr key={name}>
                    <td className="px-5 py-2">{name}</td>
                    <td className="px-5 py-2 font-bold">{v.qty}</td>
                    <td className="px-5 py-2">{brl(v.value)}</td>
                  </tr>
                ))}
                {products.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-10 text-center text-muted-foreground">
                      Nenhum item vendido no período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
