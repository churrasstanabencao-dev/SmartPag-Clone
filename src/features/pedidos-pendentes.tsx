import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, PackageSearch, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId, useStore } from "@/lib/store";
import { brl } from "@/lib/format";
import { SectionTitle, IconTile } from "@/components/AppShell";

type Pedido = {
  id: string;
  supplier: string;
  issued_at: string;
  created_at: string;
  total_cents: number;
  status: string;
  invoice_number: string | null;
};

type Transfer = {
  id: string;
  doc_number: string | null;
  issued_at: string;
  created_at: string;
  total_cents: number;
  status: string;
  payment_status: string;
};

const PEDIDO_LABEL: Record<string, { label: string; tone: string }> = {
  draft: { label: "Rascunho na loja", tone: "bg-muted text-muted-foreground" },
  pedido: { label: "Enviado à matriz", tone: "bg-chart-1/12 text-chart-1" },
  atendida: { label: "Atendido — a caminho", tone: "bg-chart-2/12 text-chart-2" },
  sent: { label: "Aguardando conferência", tone: "bg-chart-4/12 text-chart-4" },
};

const TRANSFER_LABEL: Record<string, { label: string; tone: string }> = {
  sent: { label: "Chegou — conferir e autorizar", tone: "bg-chart-4/12 text-chart-4" },
  draft: { label: "Em preparação na matriz", tone: "bg-muted text-muted-foreground" },
};

const fmtDate = (v: string) =>
  new Date(v).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

const daysAgo = (v: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(v).getTime()) / 86400000));

export function PedidosPendentesModule() {
  const storeId = currentStoreId();
  const { store } = useStore();
  const [filter, setFilter] = useState<"todos" | "pedidos" | "recebimentos">("todos");

  const { data: pedidos = [], isLoading: lp } = useQuery({
    queryKey: ["pend", "pedidos", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("id, supplier, issued_at, created_at, total_cents, status, invoice_number")
        .eq("store_id", storeId)
        .in("status", ["draft", "pedido", "atendida", "sent"])
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Pedido[];
    },
    refetchInterval: 20000,
  });

  const { data: transfers = [], isLoading: lt } = useQuery({
    queryKey: ["pend", "transfers", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfers")
        .select("id, doc_number, issued_at, created_at, total_cents, status, payment_status")
        .eq("to_store_id", storeId)
        .in("status", ["draft", "sent"])
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Transfer[];
    },
    refetchInterval: 20000,
  });

  const totals = useMemo(() => {
    const pedidosCents = pedidos.reduce((s, p) => s + (p.total_cents ?? 0), 0);
    const transfCents = transfers.reduce((s, t) => s + (t.total_cents ?? 0), 0);
    const conferir = transfers.filter((t) => t.status === "sent").length;
    return { pedidosCents, transfCents, conferir };
  }, [pedidos, transfers]);

  const showPedidos = filter !== "recebimentos";
  const showTransf = filter !== "pedidos";
  const loading = lp || lt;

  return (
    <div className="space-y-5">
      <SectionTitle icon={Clock}>
        <div>
          <p className="text-base font-black">Pedidos pendentes</p>
          <p className="text-sm text-muted-foreground">
            Acompanhe o que {store?.name ?? "a loja"} já pediu e o que ainda falta chegar.
          </p>
        </div>
      </SectionTitle>

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi
          icon={PackageSearch}
          label="Pedidos em aberto"
          value={String(pedidos.length)}
          hint={brl(totals.pedidosCents)}
        />
        <Kpi
          icon={Truck}
          label="Mercadoria a caminho"
          value={String(transfers.length)}
          hint={brl(totals.transfCents)}
        />
        <Kpi
          icon={Clock}
          label="Aguardando conferência"
          value={String(totals.conferir)}
          hint="Precisa da autorização do gestor"
        />
      </div>

      <div className="flex w-fit flex-wrap gap-1 rounded-2xl bg-muted p-1">
        {(
          [
            { id: "todos", label: "Tudo" },
            { id: "pedidos", label: "Meus pedidos" },
            { id: "recebimentos", label: "A receber da matriz" },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={
              "rounded-xl px-4 py-2 text-sm font-bold transition-colors " +
              (filter === f.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando pedidos…</p>
      ) : null}

      {showPedidos ? (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="mb-3 text-sm font-bold">Pedidos enviados</h3>
          {pedidos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum pedido pendente.</p>
          ) : (
            <div className="space-y-2">
              {pedidos.map((p) => {
                const st = PEDIDO_LABEL[p.status] ?? {
                  label: p.status,
                  tone: "bg-muted text-muted-foreground",
                };
                return (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-bold">
                        {p.supplier}
                        {p.invoice_number ? ` — NF ${p.invoice_number}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Pedido em {fmtDate(p.created_at)} · emissão {fmtDate(p.issued_at)} ·{" "}
                        {daysAgo(p.created_at)} dia(s) aguardando
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold">{brl(p.total_cents)}</span>
                      <span className={`rounded-lg px-2 py-1 text-xs font-bold ${st.tone}`}>
                        {st.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {showTransf ? (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="mb-3 text-sm font-bold">Transferências da matriz a caminho</h3>
          {transfers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada a receber no momento.</p>
          ) : (
            <div className="space-y-2">
              {transfers.map((t) => {
                const st = TRANSFER_LABEL[t.status] ?? {
                  label: t.status,
                  tone: "bg-muted text-muted-foreground",
                };
                return (
                  <div
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-bold">
                        Transferência {t.doc_number ?? t.id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Enviada em {fmtDate(t.created_at)} · emissão {fmtDate(t.issued_at)} ·{" "}
                        {daysAgo(t.created_at)} dia(s) aguardando
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold">{brl(t.total_cents)}</span>
                      <span className={`rounded-lg px-2 py-1 text-xs font-bold ${st.tone}`}>
                        {st.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
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
          <p className="text-xl font-black">{value}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
    </div>
  );
}
