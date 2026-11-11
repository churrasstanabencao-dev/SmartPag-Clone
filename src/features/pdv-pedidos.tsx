import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Bike,
  CheckCircle2,
  Inbox,
  Phone,
  Printer,
  ShoppingCart,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId } from "@/lib/store";
import { brl } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PedidoEditor } from "@/features/pdv-pedido-editor";

type TabRow = {
  id: string;
  name: string;
  kind: string;
  status: string;
  delivery_status: string;
  customer_name: string | null;
  customer_phone: string | null;
  opened_at: string;
  closed_at: string | null;
};

const minutesSince = (iso: string) =>
  Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

/**
 * Painel de pedidos no estilo Sisfood: colunas "Pedido na fila",
 * "Saiu para entrega" e "Finalizado/Concluído", com abertura rápida de
 * pedido de balcão (F1) e de delivery (F2).
 */
export function PedidosBalcaoDelivery({
  onOpenTab,
}: {
  onOpenTab?: (tabId: string) => void;
}) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<"balcao" | "delivery" | null>(null);
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  // Pedidos, pagamentos e caixa chegam sozinhos: nada de salvar na mão.
  useEffect(() => {
    const refresh = () => {
      for (const key of ["tabs", "tab_items", "payments", "cash_movements", "cash_registers", "cash_report"])
        qc.invalidateQueries({ queryKey: [key] });
    };
    const channel = supabase
      .channel("pdv-pedidos-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "tabs" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "tab_items" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, refresh)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  const openEditor = (id: string) => {
    setEditing(id);
    onOpenTab?.(id);
  };

  const { data: tabs = [] } = useQuery({
    queryKey: ["tabs", "pedidos"],
    refetchInterval: 20000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tabs")
        .select(
          "id, name, kind, status, delivery_status, customer_name, customer_phone, opened_at, closed_at",
        )
        .eq("store_id", currentStoreId())
        .in("kind", ["balcão", "delivery"])
        .order("opened_at", { ascending: false })
        .limit(120);
      if (error) throw error;
      return data as TabRow[];
    },
  });

  const { data: totals = {} } = useQuery({
    queryKey: ["tab_items", "pedidos_totais", tabs.map((t) => t.id).join(",")],
    enabled: tabs.length > 0,
    refetchInterval: 20000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tab_items")
        .select("tab_id, quantity, unit_price_cents")
        .in(
          "tab_id",
          tabs.map((t) => t.id),
        );
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const it of data ?? []) {
        map[it.tab_id] =
          (map[it.tab_id] ?? 0) + Number(it.quantity) * Number(it.unit_price_cents);
      }
      return map;
    },
  });

  const createOrder = useMutation({
    mutationFn: async (kind: "balcão" | "delivery") => {
      const seq = tabs.length + 1;
      const prefix = kind === "balcão" ? "BALCÃO" : "DELIVERY";
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("tabs")
        .insert({
          user_id: auth.user!.id,
          store_id: currentStoreId(),
          name: `${prefix} #${seq}`,
          kind,
          delivery_status: "fila",
          customer_name: customer.trim() || null,
          customer_phone: phone.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      setDialog(null);
      setCustomer("");
      setPhone("");
      qc.invalidateQueries({ queryKey: ["tabs"] });
      toast.success("Pedido aberto");
      openEditor(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("tabs")
        .update({ delivery_status: status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tabs"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tabs;
    return tabs.filter((t) =>
      [t.name, t.customer_name ?? "", t.customer_phone ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [tabs, query]);

  const fila = filtered.filter(
    (t) => t.status === "open" && t.delivery_status === "fila",
  );
  const entrega = filtered.filter(
    (t) => t.status === "open" && t.delivery_status === "entrega",
  );
  const finalizados = filtered.filter((t) => t.status !== "open");

  const card = (t: TabRow) => (
    <div key={t.id} className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="h-1 w-full bg-primary" />
      <div className="flex items-center gap-2 px-4 py-2.5">
        <span className="text-sm font-black">{t.name}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
          {t.kind}
        </span>
        <span className="ml-auto rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
          {minutesSince(t.opened_at)} min
        </span>
      </div>
      <div className="space-y-1 border-t border-border px-4 py-3 text-sm">
        <p className="truncate font-semibold">
          {t.customer_name || "Não registrado"}
        </p>
        {t.customer_phone && (
          <p className="text-xs text-muted-foreground">{t.customer_phone}</p>
        )}
        <p className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">Valor atual</span>
          <span className="font-black">{brl(totals[t.id] ?? 0)}</span>
        </p>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
        <Button size="sm" variant="outline" onClick={() => openEditor(t.id)}>
          Abrir
        </Button>
        <Button size="sm" variant="outline" onClick={() => window.print()}>
          <Printer className="size-4" />
        </Button>
        {t.status === "open" && t.kind === "delivery" && t.delivery_status === "fila" && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setStatus.mutate({ id: t.id, status: "entrega" })}
          >
            <Bike className="size-4" /> Saiu p/ entrega
          </Button>
        )}
        {t.status === "open" && (
          <Button
            size="sm"
            onClick={() => setStatus.mutate({ id: t.id, status: "finalizado" })}
          >
            <CheckCircle2 className="size-4" /> Pronto
          </Button>
        )}
      </div>
    </div>
  );

  const column = (
    title: string,
    subtitle: string,
    icon: typeof Bell,
    tone: string,
    rows: TabRow[],
    empty: string,
  ) => {
    const Icon = icon;
    return (
      <div className="min-w-0 rounded-2xl bg-muted/40 p-3">
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${tone}`}>
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black uppercase">{title}</p>
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <span className={`ml-auto rounded-md px-2 py-0.5 text-sm font-black ${tone}`}>
            {rows.length}
          </span>
        </div>
        <div className="space-y-3">
          {rows.length === 0 ? (
            <div className="grid place-items-center gap-2 py-16 text-muted-foreground">
              <Inbox className="size-8" />
              <p className="text-sm">{empty}</p>
            </div>
          ) : (
            rows.map(card)
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setDialog("balcao")}>
            <ShoppingCart className="size-4" /> Pedido balcão
            <span className="ml-1 rounded bg-primary-foreground/20 px-1.5 text-[10px] font-bold">
              F1
            </span>
          </Button>
          <Button variant="secondary" onClick={() => setDialog("delivery")}>
            <Phone className="size-4" /> Pedido delivery
            <span className="ml-1 rounded bg-foreground/10 px-1.5 text-[10px] font-bold">
              F2
            </span>
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisa rápida — pedido, cliente ou telefone..."
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {column(
          "Pedido na fila",
          "Aguardando aceite",
          Bell,
          "bg-destructive/10 text-destructive",
          fila,
          "Nenhum pedido na fila",
        )}
        {column(
          "Saiu para entrega",
          "Com entregador",
          Bike,
          "bg-chart-1/12 text-chart-1",
          entrega,
          "Nenhum pedido p/ entrega",
        )}
        {column(
          "Finalizado / concluído",
          "Hoje",
          CheckCircle2,
          "bg-chart-2/12 text-chart-2",
          finalizados,
          "Nenhum pedido finalizado",
        )}
      </div>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog === "delivery" ? "Novo pedido delivery" : "Novo pedido balcão"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Cliente (opcional)</Label>
              <Input
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                placeholder="Nome do cliente"
              />
            </div>
            {dialog === "delivery" && (
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(21) 90000-0000"
                />
              </div>
            )}
            <Button
              className="w-full"
              disabled={createOrder.isPending}
              onClick={() =>
                createOrder.mutate(dialog === "delivery" ? "delivery" : "balcão")
              }
            >
              Abrir pedido
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <PedidoEditor tabId={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
