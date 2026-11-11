import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Percent, Receipt, Truck, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store";
import { brl, dateTime, shortDate } from "@/lib/format";
import { SectionTitle, IconTile } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Payment = {
  id: string;
  store_id: string | null;
  tab_id: string | null;
  amount_cents: number;
  method: string;
  paid_at: string;
};

type Tab = { id: string; name: string; kind: string; store_id: string | null };

type Transfer = {
  id: string;
  to_store_id: string;
  doc_number: string | null;
  total_cents: number;
  status: string;
  payment_status: string;
  created_at: string;
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

function csvEscape(v: string | number) {
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const body = rows.map((r) => r.map(csvEscape).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const money = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

export function ComissoesModule() {
  const { networkStores, matriz } = useStore();
  const [from, setFrom] = useState(daysAgoISO(30));
  const [to, setTo] = useState(todayISO());
  const [storeFilter, setStoreFilter] = useState("todas");
  const [rateTabs, setRateTabs] = useState("5");
  const [rateTransfers, setRateTransfers] = useState("0");
  const [onlyPaidTransfers, setOnlyPaidTransfers] = useState("todas");
  const [view, setView] = useState<"comandas" | "transferencias">("comandas");

  const fromISO = useMemo(() => new Date(`${from}T00:00:00`).toISOString(), [from]);
  const toISO = useMemo(() => new Date(`${to}T23:59:59`).toISOString(), [to]);

  const branches = useMemo(
    () => networkStores.filter((s) => s.id !== matriz?.id),
    [networkStores, matriz?.id],
  );
  const branchIds = branches.map((s) => s.id);
  const storeName = (id: string | null) =>
    networkStores.find((s) => s.id === id)?.name ?? "—";

  const { data: payments = [] } = useQuery({
    queryKey: ["com", "payments", branchIds.join(","), fromISO, toISO],
    enabled: branchIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, store_id, tab_id, amount_cents, method, paid_at")
        .in("store_id", branchIds)
        .gte("paid_at", fromISO)
        .lte("paid_at", toISO)
        .order("paid_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as Payment[];
    },
    refetchInterval: 30000,
  });

  const tabIds = useMemo(
    () => Array.from(new Set(payments.map((p) => p.tab_id).filter(Boolean))) as string[],
    [payments],
  );

  const { data: tabs = [] } = useQuery({
    queryKey: ["com", "tabs", tabIds.join(",")],
    enabled: tabIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tabs")
        .select("id, name, kind, store_id")
        .in("id", tabIds);
      if (error) throw error;
      return (data ?? []) as Tab[];
    },
  });

  const { data: transfers = [] } = useQuery({
    queryKey: ["com", "transfers", matriz?.id, fromISO, toISO],
    enabled: !!matriz?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfers")
        .select(
          "id, to_store_id, doc_number, total_cents, status, payment_status, created_at",
        )
        .eq("from_store_id", matriz!.id)
        .gte("created_at", fromISO)
        .lte("created_at", toISO)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as Transfer[];
    },
    refetchInterval: 30000,
  });

  const pTabs = Number(rateTabs.replace(",", ".")) || 0;
  const pTransf = Number(rateTransfers.replace(",", ".")) || 0;
  const inFilter = (id: string | null) => storeFilter === "todas" || id === storeFilter;

  // Detailed comanda lines
  const comandaLines = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        store: string;
        storeId: string | null;
        comanda: string;
        kind: string;
        total: number;
        when: string;
        methods: Set<string>;
      }
    >();
    for (const p of payments) {
      if (!inFilter(p.store_id)) continue;
      const key = p.tab_id ?? p.id;
      const t = tabs.find((x) => x.id === p.tab_id);
      const cur = map.get(key);
      if (cur) {
        cur.total += p.amount_cents;
        cur.methods.add(p.method);
        if (p.paid_at > cur.when) cur.when = p.paid_at;
      } else {
        map.set(key, {
          key,
          store: storeName(p.store_id),
          storeId: p.store_id,
          comanda: t?.name ?? "Venda avulsa",
          kind: t?.kind ?? "avulso",
          total: p.amount_cents,
          when: p.paid_at,
          methods: new Set([p.method]),
        });
      }
    }
    return Array.from(map.values())
      .map((r) => ({ ...r, commission: Math.round((r.total * pTabs) / 100) }))
      .sort((a, b) => (a.when < b.when ? 1 : -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments, tabs, storeFilter, pTabs]);

  const transferLines = useMemo(() => {
    return transfers
      .filter((t) => inFilter(t.to_store_id) && t.status !== "rejected")
      .filter((t) =>
        onlyPaidTransfers === "todas" ? true : t.payment_status === "paid",
      )
      .map((t) => ({
        ...t,
        store: storeName(t.to_store_id),
        commission: Math.round((t.total_cents * pTransf) / 100),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transfers, storeFilter, pTransf, onlyPaidTransfers]);

  const rows = useMemo(() => {
    return branches
      .filter((s) => inFilter(s.id))
      .map((s) => {
        const cl = comandaLines.filter((c) => c.storeId === s.id);
        const tl = transferLines.filter((t) => t.to_store_id === s.id);
        const sales = cl.reduce((a, c) => a + c.total, 0);
        const transf = tl.reduce((a, t) => a + t.total_cents, 0);
        const commTabs = cl.reduce((a, c) => a + c.commission, 0);
        const commTransf = tl.reduce((a, t) => a + t.commission, 0);
        return {
          id: s.id,
          name: s.name,
          comandas: cl.length,
          sales,
          commTabs,
          transfers: tl.length,
          transf,
          commTransf,
          total: commTabs + commTransf,
        };
      })
      .sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches, comandaLines, transferLines, storeFilter]);

  const totals = rows.reduce(
    (a, r) => ({
      sales: a.sales + r.sales,
      transf: a.transf + r.transf,
      commTabs: a.commTabs + r.commTabs,
      commTransf: a.commTransf + r.commTransf,
      total: a.total + r.total,
      comandas: a.comandas + r.comandas,
    }),
    { sales: 0, transf: 0, commTabs: 0, commTransf: 0, total: 0, comandas: 0 },
  );

  const period = `${from}_a_${to}`;

  const exportResumo = () =>
    downloadCsv(`comissoes_resumo_${period}.csv`, [
      [
        "Loja",
        "Comandas",
        "Vendas (R$)",
        `Comissão comandas ${pTabs}% (R$)`,
        "Transferências",
        "Valor transferências (R$)",
        `Comissão transferências ${pTransf}% (R$)`,
        "Comissão total (R$)",
      ],
      ...rows.map((r) => [
        r.name,
        r.comandas,
        money(r.sales),
        money(r.commTabs),
        r.transfers,
        money(r.transf),
        money(r.commTransf),
        money(r.total),
      ]),
      [
        "TOTAL",
        totals.comandas,
        money(totals.sales),
        money(totals.commTabs),
        transferLines.length,
        money(totals.transf),
        money(totals.commTransf),
        money(totals.total),
      ],
    ]);

  const exportComandas = () =>
    downloadCsv(`comissoes_comandas_${period}.csv`, [
      ["Data", "Loja", "Comanda", "Tipo", "Formas de pagamento", "Valor (R$)", "Comissão (R$)"],
      ...comandaLines.map((c) => [
        dateTime(c.when),
        c.store,
        c.comanda,
        c.kind,
        Array.from(c.methods).join(" / "),
        money(c.total),
        money(c.commission),
      ]),
    ]);

  const exportTransferencias = () =>
    downloadCsv(`comissoes_transferencias_${period}.csv`, [
      ["Data", "Loja destino", "Documento", "Status", "Pagamento", "Valor (R$)", "Comissão (R$)"],
      ...transferLines.map((t) => [
        shortDate(t.created_at),
        t.store,
        t.doc_number ?? t.id.slice(0, 8),
        t.status,
        t.payment_status === "paid" ? "pago" : "em aberto",
        money(t.total_cents),
        money(t.commission),
      ]),
    ]);

  return (
    <div className="space-y-5">
      <SectionTitle icon={Percent} tone="bg-primary-soft text-primary">
        Comissões por loja
      </SectionTitle>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Label className="text-xs">Loja</Label>
          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as filiais</SelectItem>
              {branches.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-40">
          <Label className="text-xs">De</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="w-40">
          <Label className="text-xs">Até</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="w-36">
          <Label className="text-xs">% comandas</Label>
          <Input
            value={rateTabs}
            onChange={(e) => setRateTabs(e.target.value)}
            inputMode="decimal"
          />
        </div>
        <div className="w-36">
          <Label className="text-xs">% transferências</Label>
          <Input
            value={rateTransfers}
            onChange={(e) => setRateTransfers(e.target.value)}
            inputMode="decimal"
          />
        </div>
        <div className="w-48">
          <Label className="text-xs">Transferências</Label>
          <Select value={onlyPaidTransfers} onValueChange={setOnlyPaidTransfers}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              <SelectItem value="pagas">Somente pagas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={exportResumo} className="gap-2">
          <Download className="size-4" />
          Planilha resumo
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Kpi
          icon={Receipt}
          label="Vendas das filiais"
          value={brl(totals.sales)}
          hint={`${totals.comandas} comandas`}
        />
        <Kpi
          icon={Truck}
          label="Transferências da matriz"
          value={brl(totals.transf)}
          hint={`${transferLines.length} documentos`}
        />
        <Kpi
          icon={Percent}
          label="Comissão sobre vendas"
          value={brl(totals.commTabs)}
          hint={`${pTabs}% das comandas`}
        />
        <Kpi
          icon={Wallet}
          label="Comissão total"
          value={brl(totals.total)}
          hint={`Inclui ${brl(totals.commTransf)} de transferências`}
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Loja</th>
              <th className="px-4 py-3 text-right">Comandas</th>
              <th className="px-4 py-3 text-right">Vendas</th>
              <th className="px-4 py-3 text-right">Comissão vendas</th>
              <th className="px-4 py-3 text-right">Transferências</th>
              <th className="px-4 py-3 text-right">Valor transf.</th>
              <th className="px-4 py-3 text-right">Comissão transf.</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-3 font-semibold">{r.name}</td>
                <td className="px-4 py-3 text-right">{r.comandas}</td>
                <td className="px-4 py-3 text-right">{brl(r.sales)}</td>
                <td className="px-4 py-3 text-right">{brl(r.commTabs)}</td>
                <td className="px-4 py-3 text-right">{r.transfers}</td>
                <td className="px-4 py-3 text-right">{brl(r.transf)}</td>
                <td className="px-4 py-3 text-right">{brl(r.commTransf)}</td>
                <td className="px-4 py-3 text-right font-bold">{brl(r.total)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                  Sem movimento no período.
                </td>
              </tr>
            ) : (
              <tr className="border-t border-border bg-muted/40 font-bold">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right">{totals.comandas}</td>
                <td className="px-4 py-3 text-right">{brl(totals.sales)}</td>
                <td className="px-4 py-3 text-right">{brl(totals.commTabs)}</td>
                <td className="px-4 py-3 text-right">{transferLines.length}</td>
                <td className="px-4 py-3 text-right">{brl(totals.transf)}</td>
                <td className="px-4 py-3 text-right">{brl(totals.commTransf)}</td>
                <td className="px-4 py-3 text-right">{brl(totals.total)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-fit gap-1 rounded-2xl bg-muted p-1">
          {(
            [
              ["comandas", `Comandas (${comandaLines.length})`],
              ["transferencias", `Transferências (${transferLines.length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={
                "rounded-xl px-4 py-2 text-sm font-bold transition-colors " +
                (view === id
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {label}
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          className="gap-2"
          onClick={view === "comandas" ? exportComandas : exportTransferencias}
        >
          <Download className="size-4" />
          Exportar detalhamento
        </Button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        {view === "comandas" ? (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Data</th>
                <th className="px-4 py-3 text-left">Loja</th>
                <th className="px-4 py-3 text-left">Comanda</th>
                <th className="px-4 py-3 text-left">Pagamento</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3 text-right">Comissão</th>
              </tr>
            </thead>
            <tbody>
              {comandaLines.slice(0, 300).map((c) => (
                <tr key={c.key} className="border-t border-border">
                  <td className="px-4 py-3">{dateTime(c.when)}</td>
                  <td className="px-4 py-3">{c.store}</td>
                  <td className="px-4 py-3 font-semibold">{c.comanda}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {Array.from(c.methods).join(", ")}
                  </td>
                  <td className="px-4 py-3 text-right">{brl(c.total)}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {brl(c.commission)}
                  </td>
                </tr>
              ))}
              {comandaLines.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                    Nenhuma comanda no período.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Data</th>
                <th className="px-4 py-3 text-left">Loja destino</th>
                <th className="px-4 py-3 text-left">Documento</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3 text-right">Comissão</th>
              </tr>
            </thead>
            <tbody>
              {transferLines.slice(0, 300).map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-4 py-3">{shortDate(t.created_at)}</td>
                  <td className="px-4 py-3">{t.store}</td>
                  <td className="px-4 py-3 font-semibold">
                    {t.doc_number ?? t.id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {t.status} · {t.payment_status === "paid" ? "pago" : "em aberto"}
                  </td>
                  <td className="px-4 py-3 text-right">{brl(t.total_cents)}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {brl(t.commission)}
                  </td>
                </tr>
              ))}
              {transferLines.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                    Nenhuma transferência no período.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
}: {
  icon: any;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <IconTile icon={icon} />
        <div>
          <p className="text-xs font-semibold text-muted-foreground">{label}</p>
          <p className="text-lg font-black">{value}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
    </div>
  );
}
