import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, PackageCheck, Store, Truck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store";
import { brl } from "@/lib/format";
import { SectionTitle, IconTile } from "@/components/AppShell";
import { Button } from "@/components/ui/button";

type Order = {
  id: string;
  store_id: string | null;
  supplier: string;
  issued_at: string;
  notes: string | null;
  total_cents: number;
  status: string;
  created_at: string;
};

type Item = {
  id: string;
  purchase_id: string;
  product_id: string | null;
  name: string;
  quantity: number;
  unit_cost_cents: number;
  total_cents: number;
};

export function PedidosLojasModule() {
  const qc = useQueryClient();
  const { matriz, networkStores } = useStore();
  const [open, setOpen] = useState<string | null>(null);

  const branchIds = useMemo(
    () => networkStores.filter((s) => s.id !== matriz?.id).map((s) => s.id),
    [networkStores, matriz?.id],
  );

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["pedidos-lojas", branchIds.join(",")],
    enabled: branchIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("*")
        .in("store_id", branchIds)
        .in("status", ["pedido", "atendida"])
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Order[];
    },
    refetchInterval: 20000,
  });

  const orderIds = orders.map((o) => o.id);
  const { data: items = [] } = useQuery({
    queryKey: ["pedidos-lojas-itens", orderIds.join(",")],
    enabled: orderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_items")
        .select("id, purchase_id, product_id, name, quantity, unit_cost_cents, total_cents")
        .in("purchase_id", orderIds);
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });

  const { data: matrizProducts = [] } = useQuery({
    queryKey: ["pedidos-lojas-produtos", matriz?.id],
    enabled: !!matriz?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, wholesale_price_cents, cost_cents, stock_qty")
        .eq("store_id", matriz!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const storeName = (id: string | null) =>
    networkStores.find((s) => s.id === id)?.name ?? "Loja";

  const pendentes = orders.filter((o) => o.status === "pedido");
  const atendidos = orders.filter((o) => o.status === "atendida");
  const totalPendente = pendentes.reduce((s, o) => s + Number(o.total_cents), 0);

  const atender = useMutation({
    mutationFn: async (order: Order) => {
      if (!matriz?.id) throw new Error("Matriz não encontrada");
      if (!order.store_id) throw new Error("Pedido sem loja");
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Sessão expirada");

      const list = items.filter((i) => i.purchase_id === order.id);
      if (!list.length) throw new Error("Pedido sem itens");

      const mapped = list.map((i) => {
        const match =
          matrizProducts.find(
            (p) => p.name.trim().toLowerCase() === i.name.trim().toLowerCase(),
          ) ?? null;
        const unit = Number(
          match?.wholesale_price_cents || match?.cost_cents || i.unit_cost_cents || 0,
        );
        const q = Number(i.quantity);
        return {
          user_id: uid,
          product_id: match?.id ?? null,
          name: i.name,
          quantity: q,
          unit_price_cents: unit,
          total_cents: Math.round(q * unit),
        };
      });

      const total = mapped.reduce((s, m) => s + m.total_cents, 0);

      const { data: transfer, error } = await supabase
        .from("transfers")
        .insert({
          user_id: uid,
          from_store_id: matriz.id,
          to_store_id: order.store_id,
          doc_number: `PED-${order.id.slice(0, 6).toUpperCase()}`,
          issued_at: new Date().toISOString().slice(0, 10),
          notes: `Atendimento do pedido de ${storeName(order.store_id)}`,
          total_cents: total,
        })
        .select()
        .single();
      if (error) throw error;

      const { error: itErr } = await supabase
        .from("transfer_items")
        .insert(mapped.map((m) => ({ ...m, transfer_id: transfer.id })));
      if (itErr) throw itErr;

      const { error: sendErr } = await supabase.rpc("send_transfer", {
        _transfer_id: transfer.id,
      });
      if (sendErr) throw sendErr;

      const { error: upErr } = await supabase
        .from("purchases")
        .update({
          status: "atendida",
          notes: `${order.notes ?? ""} · Atendido pela matriz (transferência ${transfer.doc_number})`.trim(),
        })
        .eq("id", order.id);
      if (upErr) throw upErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pedidos-lojas"] });
      qc.invalidateQueries({ queryKey: ["transfers"] });
      qc.invalidateQueries({ queryKey: ["purchases"] });
      toast.success("Pedido atendido: transferência enviada para conferência da loja.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <SectionTitle icon={ClipboardList} tone="bg-chart-2/12 text-chart-2">
        Pedidos das lojas — central da matriz
      </SectionTitle>

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi
          icon={ClipboardList}
          tone="bg-chart-4/15 text-chart-4"
          label="Pedidos aguardando"
          value={String(pendentes.length)}
          hint="Enviados pelas lojas"
        />
        <Kpi
          icon={Truck}
          tone="bg-chart-1/12 text-chart-1"
          label="Valor a separar"
          value={brl(Math.round(totalPendente))}
          hint="Preço de atacado"
        />
        <Kpi
          icon={PackageCheck}
          tone="bg-chart-2/12 text-chart-2"
          label="Pedidos atendidos"
          value={String(atendidos.length)}
          hint="Viraram transferência"
        />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando pedidos…</p>}
      {!isLoading && orders.length === 0 && (
        <div className="card-surface p-10 text-center text-muted-foreground">
          Nenhum pedido das lojas por enquanto. Assim que uma filial gerar o pedido em
          Estoque → Compras matriz, ele aparece aqui.
        </div>
      )}

      <div className="space-y-3">
        {orders.map((o) => {
          const list = items.filter((i) => i.purchase_id === o.id);
          const isOpen = open === o.id;
          return (
            <div key={o.id} className="card-surface p-4">
              <div className="flex flex-wrap items-center gap-3">
                <IconTile icon={Store as never} tone="bg-chart-1/12 text-chart-1" />
                <div className="mr-auto">
                  <p className="font-bold">{storeName(o.store_id)}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleString("pt-BR")} · {list.length} item(ns)
                  </p>
                </div>
                <span
                  className={
                    "rounded-full px-2.5 py-1 text-xs font-bold " +
                    (o.status === "pedido"
                      ? "bg-chart-4/12 text-chart-4"
                      : "bg-chart-2/12 text-chart-2")
                  }
                >
                  {o.status === "pedido" ? "Aguardando separação" : "Atendido"}
                </span>
                <p className="text-lg font-black">{brl(Number(o.total_cents))}</p>
                <Button variant="outline" onClick={() => setOpen(isOpen ? null : o.id)}>
                  {isOpen ? "Fechar" : "Ver itens"}
                </Button>
                {o.status === "pedido" && (
                  <Button
                    onClick={() => atender.mutate(o)}
                    disabled={atender.isPending || list.length === 0}
                  >
                    Atender com transferência
                  </Button>
                )}
              </div>

              {isOpen && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="p-2 text-left">Produto</th>
                        <th className="p-2 text-right">Qtd pedida</th>
                        <th className="p-2 text-right">Estoque matriz</th>
                        <th className="p-2 text-right">Unitário</th>
                        <th className="p-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {list.map((i) => {
                        const match = matrizProducts.find(
                          (p) => p.name.trim().toLowerCase() === i.name.trim().toLowerCase(),
                        );
                        const stock = match ? Number(match.stock_qty) : null;
                        const falta = stock !== null && stock < Number(i.quantity);
                        return (
                          <tr key={i.id} className={falta ? "bg-destructive/5" : ""}>
                            <td className="p-2 font-semibold">{i.name}</td>
                            <td className="p-2 text-right">{Number(i.quantity)}</td>
                            <td className="p-2 text-right">
                              {stock === null ? "não cadastrado" : stock}
                            </td>
                            <td className="p-2 text-right">{brl(Number(i.unit_cost_cents))}</td>
                            <td className="p-2 text-right font-bold">
                              {brl(Number(i.total_cents))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Ao atender, a matriz gera uma transferência já enviada: o estoque sai da matriz, a
        venda é registrada e a loja confere e autoriza a entrada, criando a conta a pagar.
      </p>
    </div>
  );
}

function Kpi({
  icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="card-surface p-5">
      <IconTile icon={icon as never} tone={tone} />
      <p className="mt-4 text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
