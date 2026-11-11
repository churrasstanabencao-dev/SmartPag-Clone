import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  DollarSign,
  MapPin,
  MessageSquare,
  Minus,
  Plus,
  Printer,
  Save,
  Search,
  ShoppingCart,
  Trash2,
  User,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId } from "@/lib/store";
import { baixarEstoqueDoPedido } from "@/lib/composicao";
import { brl, parseBRLToCents } from "@/lib/format";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/smartpag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type Props = { tabId: string | null; onClose: () => void; mode?: "direto" | "mesa" };

export function PedidoEditor({ tabId, onClose, mode = "direto" }: Props) {
  const qc = useQueryClient();

  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [delivery, setDelivery] = useState({
    address: "",
    neighborhood: "",
    reference: "",
    fee: "",
    courier: "",
  });


  const invalidate = () => {
    for (const key of [
      "tabs",
      "tab_items",
      "payments",
      "cash_registers",
      "cash_movements",
      "cash_report",
      "cash_sales",
      "cash_closures",
      "products",
      "stock_movements",
    ])
      qc.invalidateQueries({ queryKey: [key] });
  };


  const { data: tab } = useQuery({
    queryKey: ["tabs", "editor", tabId],
    enabled: !!tabId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tabs")
        .select("*")
        .eq("id", tabId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    setCustomerName(tab?.customer_name ?? "");
    setNote(tab?.notes ?? "");
    setDelivery({
      address: tab?.delivery_address ?? "",
      neighborhood: tab?.delivery_neighborhood ?? "",
      reference: tab?.delivery_reference ?? "",
      fee: tab?.delivery_fee_cents ? brl(Number(tab.delivery_fee_cents)) : "",
      courier: tab?.courier_employee_id ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab?.id]);

  const isDelivery = tab?.kind === "delivery";

  const { data: employees = [] } = useQuery({
    queryKey: ["employees", "couriers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, name, job_title")
        .eq("store_id", currentStoreId())
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });


  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("store_id", currentStoreId())
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("store_id", currentStoreId())
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["tab_items", tabId],
    enabled: !!tabId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tab_items")
        .select("*")
        .eq("tab_id", tabId!)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: openRegister } = useQuery({
    queryKey: ["cash_registers", "open"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_registers")
        .select("id, name")
        .eq("store_id", currentStoreId())
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const itemsCents = items.reduce(
    (s, i) => s + Number(i.unit_price_cents) * Number(i.quantity),
    0,
  );
  const feeCents = isDelivery ? parseBRLToCents(delivery.fee) : 0;
  const totalCents = itemsCents + feeCents;

  const printSectors = () => {
    const sectorOf = (productId: string | null) => {
      const p = products.find((x) => x.id === productId);
      const c = categories.find((x) => x.id === p?.category_id);
      return (c?.print_sector ?? "cozinha") as string;
    };
    const groups = new Map<string, typeof items>();
    for (const i of items) {
      const s = sectorOf(i.product_id);
      if (s === "nenhum") continue;
      groups.set(s, [...(groups.get(s) ?? []), i]);
    }
    if (groups.size === 0) {
      toast.error("Nenhum item para enviar à produção");
      return;
    }
    const esc = (v: string) =>
      v.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
    const now = new Date().toLocaleString("pt-BR");
    const vias = [...groups.entries()]
      .map(
        ([sector, list]) => `<section>
          <h1>${esc(sector.toUpperCase())}</h1>
          <p>${esc(tab?.name ?? "Pedido")} · ${esc(customerName || "-")}</p>
          <p>${now}</p>
          <table>${list
            .map(
              (i) =>
                `<tr><td>${Number(i.quantity)}x</td><td>${esc(i.name)}</td></tr>`,
            )
            .join("")}</table>
          ${note.trim() ? `<p><b>Obs:</b> ${esc(note)}</p>` : ""}
        </section>`,
      )
      .join("");
    const w = window.open("", "_blank", "width=420,height=640");
    if (!w) return;
    w.document.write(
      `<html><head><title>Via de produção</title><style>
        body{font-family:monospace;padding:12px;width:300px}
        section{border-bottom:1px dashed #000;padding-bottom:10px;margin-bottom:14px}
        h1{font-size:16px;margin:0 0 6px}
        p{margin:2px 0;font-size:12px}
        table{width:100%;font-size:13px;margin-top:6px}
        td:first-child{width:38px;font-weight:bold}
      </style></head><body>${vias}</body></html>`,
    );
    w.document.close();
    w.focus();
    w.print();
  };


  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q)
      return products.filter((p) =>
        `${p.name} ${p.sku ?? ""}`.toLowerCase().includes(q),
      );
    if (!category) return [];
    return products.filter((p) => p.category_id === category);
  }, [products, search, category]);

  const currentCategory = categories.find((c) => c.id === category);

  const addItem = useMutation({
    mutationFn: async (productId: string) => {
      const p = products.find((x) => x.id === productId)!;
      const existing = items.find((i) => i.product_id === productId);
      if (existing) {
        const { error } = await supabase
          .from("tab_items")
          .update({ quantity: Number(existing.quantity) + 1 })
          .eq("id", existing.id);
        if (error) throw error;
        return;
      }
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("tab_items").insert({
        user_id: auth.user!.id,
        store_id: currentStoreId(),
        tab_id: tabId!,
        product_id: p.id,
        name: p.name,
        quantity: 1,
        unit_price_cents: p.price_cents,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const setQty = useMutation({
    mutationFn: async ({ id, qty }: { id: string; qty: number }) => {
      if (qty <= 0) {
        const { error } = await supabase.from("tab_items").delete().eq("id", id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("tab_items")
        .update({ quantity: qty })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const persist = async () => {
    const { error } = await supabase
      .from("tabs")
      .update({
        customer_name: customerName.trim() || null,
        notes: note.trim() || null,
        ...(isDelivery
          ? {
              delivery_address: delivery.address.trim() || null,
              delivery_neighborhood: delivery.neighborhood.trim() || null,
              delivery_reference: delivery.reference.trim() || null,
              delivery_fee_cents: feeCents,
              courier_employee_id: delivery.courier || null,
            }
          : {}),
      })
      .eq("id", tabId!);
    if (error) throw error;
  };

  const saveOrder = useMutation({
    mutationFn: persist,
    onSuccess: () => {
      invalidate();
      toast.success("Pedido salvo");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });



  const actions = [
    { key: "voltar", label: "VOLTAR", hint: "ESC", icon: ArrowLeft, onClick: onClose },
    {
      key: "salvar",
      label: "SALVAR",
      hint: "Enter",
      icon: Save,
      primary: true,
      onClick: () => saveOrder.mutate(),
    },
    {
      key: "add",
      label: "ADD ITEM",
      hint: "F1",
      icon: ShoppingCart,
      onClick: () => document.getElementById("pdv-busca-produto")?.focus(),
    },
    {
      key: "cliente",
      label: "CLIENTE",
      hint: "C",
      icon: UserPlus,
      onClick: () => document.getElementById("pdv-cliente")?.focus(),
    },
    {
      key: "producao",
      label: "PRODUÇÃO",
      hint: "F4",
      icon: Printer,
      onClick: printSectors,
    },
    {
      key: "pagar",
      label: mode === "mesa" ? "FINALIZAR" : "PAGAMENTO",
      hint: "P",
      icon: mode === "mesa" ? CheckCircle2 : MapPin,
      primary: mode === "mesa",
      onClick: () => {
        persist()
          .then(() => setPayOpen(true))
          .catch((e: Error) => toast.error(e.message));
      },
    },


    {
      key: "obs",
      label: "OBSERVAÇÃO",
      hint: "O",
      icon: MessageSquare,
      onClick: () => setNoteOpen((v) => !v),
    },
  ];

  return (
    <>
      <Dialog open={!!tabId} onOpenChange={(o) => !o && onClose()}>
        <DialogContent
          className="[&>button:last-child]:hidden max-w-[min(1400px,96vw)] gap-0 overflow-hidden p-0 sm:max-w-[min(1400px,96vw)]"
        >
          <div className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-5 py-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <ShoppingCart className="size-5" />
            </span>
            <DialogTitle className="text-xl font-black">{tab?.name ?? "Pedido"}</DialogTitle>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {actions.map((a) => {
                const Icon = a.icon;
                return (
                  <button
                    key={a.key}
                    onClick={a.onClick}
                    className={`grid min-w-[86px] place-items-center gap-0.5 rounded-xl border px-3 py-2 text-[11px] font-black transition-colors ${
                      a.primary
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card hover:bg-muted"
                    }`}
                  >
                    <Icon className="size-4" />
                    {a.label}
                    <span className="rounded bg-foreground/10 px-1 text-[9px] font-bold">
                      {a.hint}
                    </span>
                  </button>
                );
              })}
              <button
                onClick={onClose}
                aria-label="Fechar"
                className="grid size-10 place-items-center rounded-xl bg-destructive text-destructive-foreground"
              >
                <X className="size-5" />
              </button>
            </div>
          </div>

          <div className="border-b border-border px-5 py-3">
            <p className="mb-2 flex items-center gap-2 text-sm font-bold">
              <User className="size-4 text-primary" /> Cliente
            </p>
            <Input
              id="pdv-cliente"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Digite nome ou número de telefone"
            />
          </div>

          {isDelivery && (
            <div className="grid gap-2 border-b border-border px-5 py-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <Label className="mb-1 block text-xs">Endereço</Label>
                <Input
                  value={delivery.address}
                  onChange={(e) => setDelivery({ ...delivery, address: e.target.value })}
                  placeholder="Rua, número, complemento"
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Bairro</Label>
                <Input
                  value={delivery.neighborhood}
                  onChange={(e) =>
                    setDelivery({ ...delivery, neighborhood: e.target.value })
                  }
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Taxa de entrega</Label>
                <Input
                  inputMode="numeric"
                  value={delivery.fee}
                  onChange={(e) => setDelivery({ ...delivery, fee: e.target.value })}
                  placeholder="R$ 0,00"
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Entregador</Label>
                <select
                  value={delivery.courier}
                  onChange={(e) => setDelivery({ ...delivery, courier: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">Não definido</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="lg:col-span-5">
                <Label className="mb-1 block text-xs">Ponto de referência</Label>
                <Input
                  value={delivery.reference}
                  onChange={(e) =>
                    setDelivery({ ...delivery, reference: e.target.value })
                  }
                />
              </div>
            </div>
          )}

          {noteOpen && (
            <div className="border-b border-border px-5 py-3">
              <Label className="mb-2 block">Observação do pedido</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex.: sem cebola, entregar na portaria..."
              />
            </div>
          )}

          <div className="grid max-h-[64vh] grid-cols-1 gap-0 overflow-hidden lg:grid-cols-[220px_minmax(0,1fr)_360px]">
            <div className="max-h-[64vh] space-y-2 overflow-y-auto border-r border-border bg-muted/30 p-3">
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setCategory(c.id);
                    setSearch("");
                  }}
                  className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-black uppercase transition-colors ${
                    category === c.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card hover:bg-muted"
                  }`}
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: c.color }}
                  />
                  {c.name}
                </button>
              ))}
              {categories.length === 0 && (
                <p className="p-3 text-xs text-muted-foreground">
                  Cadastre categorias em Cadastro.
                </p>
              )}
            </div>

            <div className="max-h-[64vh] overflow-y-auto p-4">
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="pdv-busca-produto"
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Pesquise um produto — ENTER p/ adicionar"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && visible[0]) {
                      addItem.mutate(visible[0].id);
                      setSearch("");
                    }
                  }}
                />
              </div>
              {currentCategory && !search && (
                <p className="mb-3 text-sm font-bold text-muted-foreground">
                  → {currentCategory.name}
                </p>
              )}
              {visible.length === 0 ? (
                <div className="grid place-items-center gap-2 py-20 text-sm text-muted-foreground">
                  <ShoppingCart className="size-8" />
                  Selecione uma categoria ou pesquise um produto
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {visible.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => addItem.mutate(p.id)}
                      className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-3 text-center transition-colors hover:border-primary hover:bg-muted"
                    >
                      <span className="w-full rounded-lg bg-primary px-2 py-1 text-xs font-black text-primary-foreground">
                        {brl(Number(p.price_cents))}
                      </span>
                      <span className="text-xs font-black uppercase leading-tight">
                        {p.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex max-h-[64vh] flex-col border-l border-border">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <ShoppingCart className="size-4 text-primary" />
                <p className="text-sm font-black">Itens do pedido</p>
                <span className="ml-auto text-xs text-muted-foreground">
                  {items.length} itens
                </span>
              </div>
              <div className="flex-1 overflow-y-auto">
                {items.length === 0 ? (
                  <div className="grid place-items-center gap-2 py-24 text-sm text-muted-foreground">
                    <ShoppingCart className="size-8" />
                    Não há itens registrados
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {items.map((i) => (
                      <li key={i.id} className="flex items-center gap-2 px-4 py-2.5">
                        <div className="flex items-center gap-1">
                          <button
                            className="grid size-6 place-items-center rounded-md border border-border"
                            onClick={() =>
                              setQty.mutate({ id: i.id, qty: Number(i.quantity) - 1 })
                            }
                          >
                            <Minus className="size-3" />
                          </button>
                          <span className="w-6 text-center text-sm font-bold">
                            {Number(i.quantity)}
                          </span>
                          <button
                            className="grid size-6 place-items-center rounded-md border border-border"
                            onClick={() =>
                              setQty.mutate({ id: i.id, qty: Number(i.quantity) + 1 })
                            }
                          >
                            <Plus className="size-3" />
                          </button>
                        </div>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {i.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {brl(Number(i.unit_price_cents))}
                        </span>
                        <span className="w-20 text-right text-sm font-black">
                          {brl(Number(i.unit_price_cents) * Number(i.quantity))}
                        </span>
                        <button
                          aria-label="Remover item"
                          onClick={() => setQty.mutate({ id: i.id, qty: 0 })}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="border-t border-border p-3">
                {feeCents > 0 && (
                  <div className="mb-2 flex items-center justify-between text-xs font-bold text-muted-foreground">
                    <span>Itens {brl(itemsCents)}</span>
                    <span>Entrega {brl(feeCents)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between rounded-xl bg-foreground px-4 py-3 text-background">
                  <span className="text-sm font-bold">Total pedido</span>
                  <span className="text-xl font-black">{brl(totalCents)}</span>
                </div>

                <Button
                  className="mt-3 w-full"
                  disabled={items.length === 0}
                  onClick={() => {
                    persist()
                      .then(() => setPayOpen(true))
                      .catch((e: Error) => toast.error(e.message));
                  }}
                >
                  <DollarSign className="size-4" /> Pagamento
                </Button>

              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PagamentoDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        tabId={tabId}
        totalCents={totalCents}
        itemsCents={itemsCents}
        feeCents={feeCents}
        items={items.map((i) => ({
          product_id: i.product_id,
          quantity: Number(i.quantity),
        }))}

        registerId={openRegister?.id ?? null}
        onDone={() => {
          setPayOpen(false);
          invalidate();
          onClose();
        }}
      />
    </>
  );
}

type PagRow = { method: PaymentMethod; amount: number };

function PagamentoDialog({
  open,
  onOpenChange,
  tabId,
  totalCents,
  itemsCents,
  feeCents,
  items,
  registerId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tabId: string | null;
  totalCents: number;
  itemsCents: number;
  feeCents: number;
  items: { product_id: string | null; quantity: number }[];
  registerId: string | null;
  onDone: () => void;
}) {

  const [method, setMethod] = useState<PaymentMethod>("dinheiro");
  const [value, setValue] = useState("");
  const [rows, setRows] = useState<PagRow[]>([]);

  useEffect(() => {
    if (open) {
      setRows([]);
      setValue("");
      setMethod("dinheiro");
    }
  }, [open]);

  const paid = rows.reduce((s, r) => s + r.amount, 0);
  const remaining = Math.max(0, totalCents - paid);
  const change = Math.max(0, paid - totalCents);
  const typed = parseBRLToCents(value);

  const finalize = useMutation({
    mutationFn: async () => {
      if (!registerId)
        throw new Error("Nenhum caixa aberto. Abra o caixa para receber.");
      const list = rows.length > 0 ? rows : [{ method, amount: totalCents }];
      if (list.reduce((s, r) => s + r.amount, 0) < totalCents)
        throw new Error("Valor pago menor que o total do pedido");
      const { data: auth } = await supabase.auth.getUser();
      for (const r of list) {
        const { error } = await supabase.from("payments").insert({
          user_id: auth.user!.id,
          store_id: currentStoreId(),
          tab_id: tabId!,
          method: r.method,
          amount_cents: Math.min(r.amount, totalCents),
          register_id: registerId,
        });
        if (error) throw error;
      }

      await baixarEstoqueDoPedido({
        items,
        tabId: tabId!,
        userId: auth.user!.id,
      });


      const { error } = await supabase
        .from("tabs")
        .update({
          status: "closed",
          delivery_status: "finalizado",
          delivery_fee_cents: feeCents,
          closed_at: new Date().toISOString(),
        })
        .eq("id", tabId!);
      if (error) throw error;

    },
    onSuccess: () => {
      toast.success(
        change > 0
          ? `Pedido finalizado · troco ${brl(change)}`
          : "Pedido finalizado e lançado no caixa",
      );
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="[&>button:last-child]:hidden max-w-[min(1100px,95vw)] gap-0 overflow-hidden p-0 sm:max-w-[min(1100px,95vw)]"
      >
        <div className="flex items-center gap-3 border-b border-border px-5 py-3">
          <DollarSign className="size-5 text-chart-3" />
          <DialogTitle className="text-lg font-black uppercase">Pagamento</DialogTitle>
          <div className="ml-4 flex items-baseline gap-2 rounded-xl bg-muted px-3 py-1.5">
            <span className="text-[10px] font-black uppercase text-muted-foreground">
              Total do pedido
            </span>
            <span className="text-xl font-black tabular-nums text-chart-3">
              {brl(totalCents)}
            </span>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            aria-label="Fechar"
            className="ml-auto grid size-9 place-items-center rounded-xl bg-destructive text-destructive-foreground"
          >
            <X className="size-4" />
          </button>
        </div>


        <div className="grid gap-0 lg:grid-cols-2">
          <div className="border-r border-border p-4">
            <p className="mb-3 text-sm font-black">Forma de pagamento</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMethod(m.id)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold transition-colors ${
                    method === m.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card hover:bg-muted"
                  }`}
                >
                  <span className={`grid size-8 place-items-center rounded-lg ${m.tone}`}>
                    <DollarSign className="size-4" />
                  </span>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col p-4">
            <p className="mb-3 text-sm font-black">Pagamentos</p>
            <Input
              inputMode="numeric"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={brl(remaining)}
              className="h-12 text-lg font-black"
            />
            <div className="mt-3 flex gap-2">
              <Button variant="outline" onClick={() => setValue("")}>
                Limpar
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  const amount = typed > 0 ? typed : remaining;
                  if (amount <= 0) return;
                  setRows((r) => [...r, { method, amount }]);
                  setValue("");
                }}
              >
                <Check className="size-4" /> Adicionar valor
              </Button>
            </div>

            <div className="mt-4 flex-1 space-y-2 overflow-y-auto">
              <p className="text-[11px] font-bold uppercase text-muted-foreground">
                Pagamentos registrados
              </p>
              {rows.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Não há pagamentos registrados
                </p>
              ) : (
                rows.map((r, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm"
                  >
                    <span className="font-semibold">
                      {PAYMENT_METHODS.find((m) => m.id === r.method)?.label}
                    </span>
                    <span className="ml-auto font-black">{brl(r.amount)}</span>
                    <button
                      aria-label="Remover pagamento"
                      onClick={() => setRows((list) => list.filter((_, i) => i !== idx))}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 space-y-1 border-t border-border pt-3 text-sm font-bold">
              {feeCents > 0 && (
                <>
                  <p className="flex justify-between text-muted-foreground">
                    <span>ITENS</span>
                    <span>{brl(itemsCents)}</span>
                  </p>
                  <p className="flex justify-between text-muted-foreground">
                    <span>TAXA DE ENTREGA</span>
                    <span>{brl(feeCents)}</span>
                  </p>
                </>
              )}
              <p className="flex justify-between">
                <span>TOTAL A PAGAR</span>
                <span>{brl(totalCents)}</span>
              </p>

              <p className="flex justify-between text-chart-2">
                <span>TOTAL PAGO</span>
                <span>{brl(paid)}</span>
              </p>
              <p className="flex justify-between text-destructive">
                <span>{change > 0 ? "TROCO" : "TOTAL RESTANTE"}</span>
                <span>{brl(change > 0 ? change : remaining)}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border p-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <ArrowLeft className="size-4" /> Voltar
          </Button>
          <Button
            className="ml-auto"
            disabled={totalCents <= 0 || finalize.isPending}
            onClick={() => finalize.mutate()}
          >
            <CheckCircle2 className="size-4" /> Finalizar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
