import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  ShoppingCart,
  Trash2,
  FileText,
  CheckCircle2,
  Plus,
  ShoppingBag,
  Banknote,
  ArrowUpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId } from "@/lib/store";
import { brl, dateTime, parseBRLToCents, shortDate } from "@/lib/format";
import { methodLabel } from "@/lib/smartpag";
import { SectionTitle, IconTile } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Draft = {
  product_id: string;
  name: string;
  quantity: string;
  unit_cost: string;
};

const emptyDraft: Draft = { product_id: "", name: "", quantity: "1", unit_cost: "" };

export function ComprasModule() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"nota" | "relatorio">("nota");
  const [supplier, setSupplier] = useState("");
  const [invoice, setInvoice] = useState("");
  const [issuedAt, setIssuedAt] = useState(new Date().toISOString().slice(0, 10));
  const [freight, setFreight] = useState("");
  const [discount, setDiscount] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Draft[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [openId, setOpenId] = useState<string | null>(null);
  const [payFromCash, setPayFromCash] = useState(true);
  const [payMethod, setPayMethod] = useState("dinheiro");

  const { data: products = [] } = useQuery({
    queryKey: ["products", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*")
        .eq("store_id", currentStoreId()).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: purchases = [] } = useQuery({
    queryKey: ["purchases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("*, purchase_items(*)")
        .eq("store_id", currentStoreId())
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const itemsTotal = items.reduce(
    (s, i) => s + (Number(i.quantity.replace(",", ".")) || 0) * parseBRLToCents(i.unit_cost),
    0,
  );
  const total = Math.round(itemsTotal) + parseBRLToCents(freight) - parseBRLToCents(discount);

  function addItem() {
    const product = products.find((p) => p.id === draft.product_id);
    if (!product) {
      toast.error("Selecione um produto");
      return;
    }
    const q = Number(draft.quantity.replace(",", ".")) || 0;
    if (q <= 0) {
      toast.error("Informe a quantidade");
      return;
    }
    if (parseBRLToCents(draft.unit_cost) <= 0) {
      toast.error("Informe o custo unitário");
      return;
    }
    setItems((prev) => [...prev, { ...draft, name: product.name }]);
    setDraft(emptyDraft);
  }

  const save = useMutation({
    mutationFn: async (confirm: boolean) => {
      if (items.length === 0) throw new Error("Adicione ao menos um item à nota");
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user!.id;
      const { data: purchase, error } = await supabase
        .from("purchases")
        .insert({
          user_id: uid,
          store_id: currentStoreId(),
          supplier: supplier || "Fornecedor",
          invoice_number: invoice || null,
          issued_at: issuedAt,
          notes: notes || null,
          freight_cents: parseBRLToCents(freight),
          discount_cents: parseBRLToCents(discount),
          total_cents: total,
        })
        .select()
        .single();
      if (error) throw error;

      const rows = items.map((i) => {
        const q = Number(i.quantity.replace(",", ".")) || 0;
        const unit = parseBRLToCents(i.unit_cost);
        return {
          user_id: uid,
          store_id: currentStoreId(),
          purchase_id: purchase.id,
          product_id: i.product_id,
          name: i.name,
          quantity: q,
          unit_cost_cents: unit,
          total_cents: Math.round(q * unit),
        };
      });
      const { error: itemErr } = await supabase.from("purchase_items").insert(rows);
      if (itemErr) throw itemErr;

      if (confirm) {
        const { error: rpcErr } = await supabase.rpc("send_purchase", {
          _purchase_id: purchase.id,
        });
        if (rpcErr) throw rpcErr;
      }
    },
    onSuccess: (_d, confirm) => {
      setItems([]);
      setSupplier("");
      setInvoice("");
      setFreight("");
      setDiscount("");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["purchases"] });
      toast.success(
        confirm ? "Nota enviada para conferência do gestor" : "Nota salva como rascunho",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendPurchase = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("send_purchase", { _purchase_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      toast.success("Nota enviada para conferência");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approvePurchase = useMutation({
    mutationFn: async ({ id, received }: { id: string; received: Record<string, string> }) => {
      for (const [itemId, value] of Object.entries(received)) {
        const q = Number(String(value).replace(",", ".")) || 0;
        const { error } = await supabase
          .from("purchase_items")
          .update({ received_quantity: q })
          .eq("id", itemId);
        if (error) throw error;
      }
      const { error } = await supabase.rpc("approve_purchase", { _purchase_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Nota autorizada: estoque, custo médio e conta a pagar atualizados");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rejectPurchase = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc(
        "reject_purchase",
        reason ? { _purchase_id: id, _reason: reason } : { _purchase_id: id },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      toast.success("Nota recusada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const payPurchase = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("pay_purchase", { _purchase_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Conta a pagar quitada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removePurchase = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("purchases").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      toast.success("Nota removida");
    },
    onError: (e: Error) => toast.error(e.message),
  });


  return (
    <div className="space-y-6">
      <SectionTitle icon={ShoppingCart} tone="bg-chart-1/12 text-chart-1">
        Compras e entrada de mercadoria
      </SectionTitle>

      <div className="flex gap-2 border-b border-border">
        {([
          { id: "nota", label: "Entrada de nota" },
          { id: "relatorio", label: "Relatório de compras" },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "nota" ? (
        <div className="space-y-6">
          <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
            <div className="card-surface p-5">
              <h3 className="mb-4 font-bold">Nota de entrada manual</h3>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Fornecedor</Label>
                  <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Distribuidora" />
                </div>
                <div className="space-y-2">
                  <Label>Nº da nota</Label>
                  <Input value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="000123" />
                </div>
                <div className="space-y-2">
                  <Label>Emissão</Label>
                  <Input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-border p-4">
                <p className="mb-3 text-sm font-semibold">Itens da nota</p>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-56 space-y-2">
                    <Label>Produto</Label>
                    <Select
                      value={draft.product_id}
                      onValueChange={(v) => setDraft((d) => ({ ...d, product_id: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-24 space-y-2">
                    <Label>Qtd.</Label>
                    <Input
                      value={draft.quantity}
                      inputMode="decimal"
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, quantity: e.target.value.replace(/[^\d.,]/g, "") }))
                      }
                    />
                  </div>
                  <div className="w-36 space-y-2">
                    <Label>Custo unitário</Label>
                    <Input
                      value={draft.unit_cost ? brl(parseBRLToCents(draft.unit_cost)) : ""}
                      placeholder="R$ 0,00"
                      onChange={(e) => setDraft((d) => ({ ...d, unit_cost: e.target.value }))}
                    />
                  </div>
                  <Button variant="secondary" onClick={addItem}>
                    <Plus className="size-4" /> Adicionar
                  </Button>
                </div>

                <div className="mt-4 divide-y divide-border">
                  {items.length === 0 && (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      Nenhum item lançado nesta nota.
                    </p>
                  )}
                  {items.map((i, idx) => {
                    const q = Number(i.quantity.replace(",", ".")) || 0;
                    const unit = parseBRLToCents(i.unit_cost);
                    return (
                      <div key={idx} className="flex items-center gap-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{i.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {q} × {brl(unit)}
                          </p>
                        </div>
                        <span className="ml-auto font-bold">{brl(Math.round(q * unit))}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setItems((prev) => prev.filter((_, n) => n !== idx))}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Frete</Label>
                  <Input
                    value={freight ? brl(parseBRLToCents(freight)) : ""}
                    placeholder="R$ 0,00"
                    onChange={(e) => setFreight(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Desconto</Label>
                  <Input
                    value={discount ? brl(parseBRLToCents(discount)) : ""}
                    placeholder="R$ 0,00"
                    onChange={(e) => setDiscount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Total do nota</Label>
                  <div className="flex h-9 items-center rounded-md bg-muted px-3 text-lg font-black">
                    {brl(total)}
                  </div>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                <Label>Observações</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <Button disabled={save.isPending} onClick={() => save.mutate(true)}>
                  <CheckCircle2 className="size-4" /> Enviar para conferência
                </Button>
                <Button variant="outline" disabled={save.isPending} onClick={() => save.mutate(false)}>
                  Salvar rascunho
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                A nota sai da matriz/fornecedor e fica aguardando conferência. O estoque só entra e a
                conta a pagar só é criada depois que o gestor da loja confere as quantidades e autoriza
                — o custo é recalculado pela média ponderada com o que foi conferido.
              </p>

            </div>

            <div className="card-surface">
              <h3 className="border-b border-border px-5 py-3 font-bold">Custo médio atual</h3>
              <div className="max-h-[420px] divide-y divide-border overflow-y-auto">
                {products.length === 0 && (
                  <p className="p-10 text-center text-sm text-muted-foreground">
                    Cadastre produtos primeiro.
                  </p>
                )}
                {products.map((p) => {
                  const margin = Number(p.price_cents) - Number(p.cost_cents);
                  return (
                    <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          saldo {Number(p.stock_qty)} · venda {brl(Number(p.price_cents))}
                        </p>
                      </div>
                      <div className="ml-auto text-right">
                        <p className="font-black">{brl(Number(p.cost_cents))}</p>
                        <p
                          className={`text-xs font-semibold ${
                            margin >= 0 ? "text-chart-2" : "text-destructive"
                          }`}
                        >
                          margem {brl(margin)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="card-surface">
            <h3 className="border-b border-border px-5 py-3 font-bold">Notas lançadas</h3>
            <div className="divide-y divide-border">
              {purchases.length === 0 && (
                <p className="p-10 text-center text-sm text-muted-foreground">
                  Nenhuma nota de compra registrada.
                </p>
              )}
              {purchases.map((n) => (
                <PurchaseRow
                  key={n.id}
                  purchase={n}
                  open={openId === n.id}
                  onToggle={() => setOpenId(openId === n.id ? null : n.id)}
                  onSend={() => sendPurchase.mutate(n.id)}
                  onApprove={(received) => approvePurchase.mutate({ id: n.id, received })}
                  onReject={(reason) => rejectPurchase.mutate({ id: n.id, reason })}
                  onPay={() => payPurchase.mutate(n.id)}
                  onRemove={() => removePurchase.mutate(n.id)}
                  busy={
                    sendPurchase.isPending ||
                    approvePurchase.isPending ||
                    rejectPurchase.isPending ||
                    payPurchase.isPending
                  }
                />
              ))}

            </div>
          </div>
        </div>
      ) : (
        <RelatorioCompras products={products} />
      )}
    </div>
  );
}

type PurchaseStatus = { label: string; tone: string; chip: string };
const DRAFT_STATUS: PurchaseStatus = {
  label: "Rascunho",
  tone: "bg-muted text-muted-foreground",
  chip: "bg-muted text-muted-foreground",
};
const PURCHASE_STATUS: Record<string, PurchaseStatus> = {
  pedido: {
    label: "Pedido enviado à matriz",
    tone: "bg-chart-1/12 text-chart-1",
    chip: "bg-chart-1/12 text-chart-1",
  },
  atendida: {
    label: "Atendido pela matriz",
    tone: "bg-chart-2/12 text-chart-2",
    chip: "bg-chart-2/12 text-chart-2",
  },
  draft: {
    label: "Rascunho",
    tone: "bg-muted text-muted-foreground",
    chip: "bg-muted text-muted-foreground",
  },
  sent: {
    label: "Aguardando conferência",
    tone: "bg-chart-4/12 text-chart-4",
    chip: "bg-chart-4/12 text-chart-4",
  },
  confirmed: {
    label: "Confirmada",
    tone: "bg-chart-2/12 text-chart-2",
    chip: "bg-chart-2/12 text-chart-2",
  },
  approved: {
    label: "Autorizada",
    tone: "bg-chart-2/12 text-chart-2",
    chip: "bg-chart-2/12 text-chart-2",
  },
  rejected: {
    label: "Recusada",
    tone: "bg-destructive/10 text-destructive",
    chip: "bg-destructive/10 text-destructive",
  },
};

function PurchaseRow({
  purchase: n,
  open,
  onToggle,
  onSend,
  onApprove,
  onReject,
  onPay,
  onRemove,
  busy,
}: {
  purchase: any;
  open: boolean;
  onToggle: () => void;
  onSend: () => void;
  onApprove: (received: Record<string, string>) => void;
  onReject: (reason: string) => void;
  onPay: () => void;
  onRemove: () => void;
  busy: boolean;
}) {
  const status: PurchaseStatus = PURCHASE_STATUS[n.status] ?? DRAFT_STATUS;
  const items: any[] = n.purchase_items ?? [];
  const [conf, setConf] = useState(false);
  const [received, setReceived] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      items.map((i) => [i.id, String(i.received_quantity ?? i.quantity)]),
    ),
  );
  const [reason, setReason] = useState("");

  const confTotal =
    items.reduce((s, i) => {
      const q = Number(String(received[i.id] ?? i.quantity).replace(",", ".")) || 0;
      return s + q * Number(i.unit_cost_cents);
    }, 0) +
    Number(n.freight_cents) -
    Number(n.discount_cents);

  return (
    <div className="px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <IconTile icon={FileText} tone={status.tone} />
        <button className="min-w-0 text-left" onClick={onToggle}>
          <p className="truncate font-semibold">
            {n.supplier}
            {n.invoice_number ? ` · NF ${n.invoice_number}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            {shortDate(n.issued_at)} · {items.length} item(ns)
          </p>
        </button>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${status.chip}`}>
          {status.label}
        </span>
        <span className="ml-auto font-black">{brl(Number(n.total_cents))}</span>

        {n.status === "draft" && (
          <Button size="sm" disabled={busy} onClick={onSend}>
            Enviar para conferência
          </Button>
        )}
        {n.status === "sent" && (
          <Button size="sm" variant={conf ? "secondary" : "default"} onClick={() => setConf(!conf)}>
            <CheckCircle2 className="size-4" /> Conferir e autorizar
          </Button>
        )}
        {n.status === "approved" && n.expense_id && (
          <Button size="sm" variant="outline" disabled={busy} onClick={onPay}>
            <Banknote className="size-4" /> Quitar conta a pagar
          </Button>
        )}
        <Button size="icon" variant="ghost" onClick={onRemove}>
          <Trash2 className="size-4" />
        </Button>
      </div>

      {n.status === "rejected" && n.rejected_reason && (
        <p className="mt-1 text-xs text-destructive">Motivo: {n.rejected_reason}</p>
      )}

      {conf && n.status === "sent" && (
        <div className="mt-3 space-y-3 rounded-xl border border-chart-4/40 bg-chart-4/5 p-4">
          <p className="text-sm font-semibold">Conferência de recebimento</p>
          <div className="divide-y divide-border">
            {items.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{i.name}</p>
                  <p className="text-xs text-muted-foreground">
                    nota: {Number(i.quantity)} × {brl(Number(i.unit_cost_cents))}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <Label className="text-xs">Conferido</Label>
                  <Input
                    className="w-24"
                    inputMode="decimal"
                    value={received[i.id] ?? ""}
                    onChange={(e) =>
                      setReceived((r) => ({
                        ...r,
                        [i.id]: e.target.value.replace(/[^\d.,]/g, ""),
                      }))
                    }
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted-foreground">Conta a pagar pelo conferido:</span>
            <span className="text-lg font-black">{brl(Math.max(0, Math.round(confTotal)))}</span>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Button disabled={busy} onClick={() => onApprove(received)}>
              <CheckCircle2 className="size-4" /> Autorizar entrada
            </Button>
            <div className="w-56 space-y-1">
              <Label className="text-xs">Motivo da recusa</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Opcional" />
            </div>
            <Button variant="outline" disabled={busy} onClick={() => onReject(reason)}>
              Recusar nota
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Ao autorizar, o estoque entra pelas quantidades conferidas, o custo médio é recalculado e a
            conta a pagar é gerada em aberto no financeiro da loja.
          </p>
        </div>
      )}

      {open && (
        <div className="mt-2 space-y-1 rounded-lg bg-muted/60 p-3 text-sm">
          {items.map((i) => (
            <div key={i.id} className="flex justify-between">
              <span>
                {i.name} — {Number(i.quantity)} × {brl(Number(i.unit_cost_cents))}
                {i.received_quantity != null && Number(i.received_quantity) !== Number(i.quantity)
                  ? ` · conferido ${Number(i.received_quantity)}`
                  : ""}
              </span>
              <span className="font-semibold">{brl(Number(i.total_cents))}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-border pt-1 text-xs text-muted-foreground">
            <span>Frete {brl(Number(n.freight_cents))}</span>
            <span>Desconto {brl(Number(n.discount_cents))}</span>
          </div>
          {n.notes && <p className="text-xs text-muted-foreground">{n.notes}</p>}
        </div>
      )}
    </div>
  );
}

function RelatorioCompras({ products }: { products: any[] }) {

  const [days, setDays] = useState("30");
  const since = new Date(Date.now() - (Number(days) - 1) * 86400000);
  since.setHours(0, 0, 0, 0);
  const sinceDate = since.toISOString().slice(0, 10);

  const { data: reportPurchases = [] } = useQuery({
    queryKey: ["purchases", "report", days],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("*, purchase_items(*)")
        .eq("store_id", currentStoreId())
        .gte("issued_at", sinceDate)
        .order("issued_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: cashOut = [] } = useQuery({
    queryKey: ["cash_movements", "compras", days],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_movements")
        .select("*")
        .eq("store_id", currentStoreId())
        .eq("kind", "saida")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.filter((m: any) => m.description.toLowerCase().startsWith("compra"));
    },
  });

  const confirmed = reportPurchases.filter(
    (p: any) => p.status === "confirmed" || p.status === "approved",
  );
  const totalSpent = confirmed.reduce((s: number, p: any) => s + Number(p.total_cents), 0);
  const drafts = reportPurchases.filter(
    (p: any) => p.status === "draft" || p.status === "sent",
  );
  const draftsTotal = drafts.reduce((s: number, p: any) => s + Number(p.total_cents), 0);
  const paidByCash = cashOut.reduce((s: number, m: any) => s + Number(m.amount_cents), 0);

  const stockValue = products.reduce(
    (s: number, p: any) => s + Math.max(0, Number(p.stock_qty)) * Number(p.cost_cents),
    0,
  );
  const tracked = products.filter((p: any) => p.track_stock);
  const lowStock = tracked.filter((p: any) => Number(p.stock_qty) <= Number(p.min_stock));

  const chart = Array.from({ length: Number(days) }, (_, i) => {
    const d = new Date(since.getTime() + i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const value = confirmed
      .filter((p: any) => p.issued_at === key)
      .reduce((s: number, p: any) => s + Number(p.total_cents), 0);
    return {
      dia: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      valor: value / 100,
    };
  });

  const bought = Object.values(
    confirmed
      .flatMap((p: any) => p.purchase_items ?? [])
      .reduce<Record<string, { name: string; qty: number; value: number }>>((acc, i: any) => {
        const entry = (acc[i.name] ??= { name: i.name, qty: 0, value: 0 });
        entry.qty += Number(i.quantity);
        entry.value += Number(i.total_cents);
        return acc;
      }, {}),
  ).sort((a, b) => b.value - a.value);

  const cards = [
    { label: "Total gasto (confirmado)", value: brl(totalSpent), tone: "bg-chart-1/12 text-chart-1" },
    { label: "Notas lançadas", value: String(confirmed.length), tone: "bg-chart-2/12 text-chart-2" },
    { label: "Pago pelo caixa", value: brl(paidByCash), tone: "bg-destructive/10 text-destructive" },
    { label: "Estoque a custo médio", value: brl(stockValue), tone: "bg-chart-4/12 text-chart-4" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3">
          <IconTile icon={ShoppingBag} tone="bg-chart-1/12 text-chart-1" />
          <h3 className="text-lg font-bold">Relatório de compras</h3>
        </div>
        <div className="ml-auto w-44">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card-surface p-5">
            <p className="text-xs font-semibold text-muted-foreground">{c.label}</p>
            <p className="mt-1 text-2xl font-black">{c.value}</p>
            <span className={`mt-3 inline-block h-1.5 w-10 rounded-full ${c.tone}`} />
          </div>
        ))}
      </div>

      {drafts.length > 0 && (
        <div className="card-surface flex flex-wrap items-center gap-3 border-chart-4/40 p-4 text-sm">
          <span>
            <span className="font-bold">{drafts.length}</span> nota(s) em rascunho somando{" "}
            <span className="font-bold">{brl(draftsTotal)}</span> ainda não entraram no estoque.
          </span>
        </div>
      )}

      <div className="card-surface p-5">
        <h3 className="mb-4 font-bold">Compras por dia</h3>
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="dia" tickLine={false} axisLine={false} fontSize={12} interval="preserveStartEnd" />
              <YAxis tickLine={false} axisLine={false} fontSize={12} width={52} />
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
          <h3 className="border-b border-border px-5 py-3 font-bold">Produtos comprados</h3>
          <div className="max-h-[420px] divide-y divide-border overflow-y-auto">
            {bought.length === 0 && (
              <p className="p-10 text-center text-sm text-muted-foreground">
                Nenhuma compra confirmada no período.
              </p>
            )}
            {bought.map((b) => (
              <div key={b.name} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{b.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {b.qty} un. · custo médio da compra {brl(Math.round(b.value / (b.qty || 1)))}
                  </p>
                </div>
                <span className="ml-auto font-black">{brl(b.value)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card-surface">
          <div className="flex items-center gap-3 border-b border-border px-5 py-3">
            <h3 className="font-bold">Saldo do estoque</h3>
            <span className="ml-auto text-sm font-bold">{brl(stockValue)}</span>
          </div>
          <div className="max-h-[420px] divide-y divide-border overflow-y-auto">
            {products.length === 0 && (
              <p className="p-10 text-center text-sm text-muted-foreground">
                Cadastre produtos para ver o saldo.
              </p>
            )}
            {products.map((p: any) => {
              const qty = Number(p.stock_qty);
              const low = p.track_stock && qty <= Number(p.min_stock);
              return (
                <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {qty} un. × {brl(Number(p.cost_cents))}
                    </p>
                  </div>
                  <span className={`ml-auto font-black ${low ? "text-chart-4" : ""}`}>
                    {brl(Math.max(0, qty) * Number(p.cost_cents))}
                  </span>
                </div>
              );
            })}
          </div>
          {lowStock.length > 0 && (
            <p className="border-t border-border px-5 py-3 text-xs text-chart-4">
              {lowStock.length} produto(s) no estoque mínimo.
            </p>
          )}
        </div>
      </div>

      <div className="card-surface">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
          <IconTile icon={Banknote} tone="bg-destructive/10 text-destructive" />
          <h3 className="font-bold">Saídas de caixa por compras</h3>
          <span className="ml-auto font-black">{brl(paidByCash)}</span>
        </div>
        <div className="max-h-[360px] divide-y divide-border overflow-y-auto">
          {cashOut.length === 0 && (
            <p className="p-10 text-center text-sm text-muted-foreground">
              Nenhuma compra paga pelo caixa no período.
            </p>
          )}
          {cashOut.map((m: any) => (
            <div key={m.id} className="flex items-center gap-3 px-5 py-3">
              <IconTile icon={ArrowUpCircle} tone="bg-destructive/10 text-destructive" />
              <div className="min-w-0">
                <p className="truncate font-semibold">{m.description}</p>
                <p className="text-xs text-muted-foreground">
                  {methodLabel(m.method)} · {dateTime(m.created_at)}
                </p>
              </div>
              <span className="ml-auto font-bold text-destructive">
                -{brl(Number(m.amount_cents))}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="card-surface">
        <h3 className="border-b border-border px-5 py-3 font-bold">Notas do período</h3>
        <div className="divide-y divide-border">
          {reportPurchases.length === 0 && (
            <p className="p-10 text-center text-sm text-muted-foreground">
              Nenhuma nota lançada no período.
            </p>
          )}
          {reportPurchases.map((n: any) => (
            <div key={n.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {n.supplier}
                  {n.invoice_number ? ` · NF ${n.invoice_number}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {shortDate(n.issued_at)} · {n.purchase_items?.length ?? 0} item(ns) ·{" "}
                  {(PURCHASE_STATUS[n.status] ?? DRAFT_STATUS).label}
                </p>
              </div>
              <span className="ml-auto font-black">{brl(Number(n.total_cents))}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
