import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Truck, Trash2, CheckCircle2, Store as StoreIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { brl, parseBRLToCents, shortDate } from "@/lib/format";
import { useStore } from "@/lib/store";
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

type Line = {
  product_id: string;
  name: string;
  quantity: string;
  unit: string;
};

export function TransferenciasModule() {
  const { stores, networkStores, storeId, matriz } = useStore();
  const qc = useQueryClient();

  const origin = storeId ?? matriz?.id ?? null;
  const destinos = useMemo(
    () => (networkStores.length ? networkStores : stores).filter((s) => s.id !== origin),
    [networkStores, stores, origin],
  );

  const [to, setTo] = useState<string>("");
  const [doc, setDoc] = useState("");
  const [issued, setIssued] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [pick, setPick] = useState("");
  const [conferindo, setConferindo] = useState<string | null>(null);
  const [recv, setRecv] = useState<Record<string, string>>({});


  const { data: products = [] } = useQuery({
    queryKey: ["products", "transfer", origin],
    enabled: !!origin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, stock_qty, cost_cents, wholesale_price_cents, price_cents")
        .eq("store_id", origin!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: transfers = [] } = useQuery({
    queryKey: ["transfers", origin],
    enabled: !!origin,
    refetchInterval: 20000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfers")
        .select("*, transfer_items(*)")
        .or(`from_store_id.eq.${origin},to_store_id.eq.${origin}`)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? "Loja";

  const addLine = (productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    if (lines.some((l) => l.product_id === productId)) return;
    const price = Number(p.wholesale_price_cents) || Number(p.cost_cents) || 0;
    setLines((prev) => [
      ...prev,
      {
        product_id: p.id,
        name: p.name,
        quantity: "1",
        unit: (price / 100).toFixed(2).replace(".", ","),
      },
    ]);
    setPick("");
  };

  const total = lines.reduce(
    (a, l) => a + Number(l.quantity.replace(",", ".") || 0) * parseBRLToCents(l.unit),
    0,
  );

  const invalidateAll = () => {
    for (const k of [
      "transfers",
      "products",
      "stock_movements",
      "expenses",
      "payments",
      "tabs",
      "cash_movements",
      "cash_registers",
      "sales",
      "network",
    ]) {
      qc.invalidateQueries({ queryKey: [k] });
    }
  };

  const save = useMutation({
    mutationFn: async (confirm: boolean) => {
      if (!origin) throw new Error("Selecione a loja de origem no topo");
      if (!to) throw new Error("Escolha a loja de destino");
      if (lines.length === 0) throw new Error("Adicione ao menos um produto");
      const { data: auth } = await supabase.auth.getUser();

      const { data: tr, error } = await supabase
        .from("transfers")
        .insert({
          user_id: auth.user!.id,
          from_store_id: origin,
          to_store_id: to,
          doc_number: doc.trim() || null,
          issued_at: issued,
          notes: notes.trim() || null,
          total_cents: total,
          status: "draft",
        })
        .select()
        .single();
      if (error) throw error;

      const payload = lines.map((l) => {
        const qty = Number(l.quantity.replace(",", ".") || 0);
        const unit = parseBRLToCents(l.unit);
        return {
          user_id: auth.user!.id,
          transfer_id: tr.id,
          product_id: l.product_id,
          name: l.name,
          quantity: qty,
          unit_price_cents: unit,
          total_cents: Math.round(qty * unit),
        };
      });
      const { error: itErr } = await supabase.from("transfer_items").insert(payload);
      if (itErr) throw itErr;

      if (confirm) {
        const { error: cErr } = await supabase.rpc("send_transfer", {
          _transfer_id: tr.id,
        });
        if (cErr) throw cErr;
      }
      return confirm;
    },
    onSuccess: (confirmed) => {
      toast.success(
        confirmed
          ? "Transferência enviada: aguardando autorização do gestor da loja de destino"
          : "Rascunho salvo",
      );
      setLines([]);
      setDoc("");
      setNotes("");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const enviar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("send_transfer", { _transfer_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Enviada para autorização do gestor da loja");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const autorizar = useMutation({
    mutationFn: async (t: any) => {
      const items: any[] = t.transfer_items ?? [];
      for (const it of items) {
        const raw = recv[it.id];
        const qty =
          raw === undefined || raw === ""
            ? Number(it.quantity)
            : Number(String(raw).replace(",", "."));
        if (Number.isNaN(qty) || qty < 0) throw new Error("Quantidade conferida inválida");
        const { error } = await supabase
          .from("transfer_items")
          .update({ received_quantity: qty })
          .eq("id", it.id);
        if (error) throw error;
      }
      const { error } = await supabase.rpc("approve_transfer", { _transfer_id: t.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conferido e autorizado: estoque atualizado e conta a pagar lançada");
      setConferindo(null);
      setRecv({});
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const recusar = useMutation({
    mutationFn: async (id: string) => {
      const reason = window.prompt("Motivo da recusa (opcional)") ?? "";
      const { error } = await supabase.rpc("reject_transfer", {
        _transfer_id: id,
        _reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transferência recusada e estoque devolvido à origem");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const enviadas = transfers.filter((t) => t.from_store_id === origin);
  const aReceber = enviadas
    .filter((t) => t.status === "approved" && t.payment_status !== "paid")
    .reduce((a, t) => a + Number(t.total_cents), 0);
  const recebidas = transfers.filter((t) => t.to_store_id === origin);
  const aPagar = recebidas
    .filter((t) => t.status === "approved" && t.payment_status !== "paid")
    .reduce((a, t) => a + Number(t.total_cents), 0);

  const pendentes = recebidas.filter((t) => t.status === "sent");

  const marcarPago = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("pay_transfer", { _transfer_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conta a pagar quitada");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Enviado (a receber)" value={brl(aReceber)} hint={`${enviadas.length} envios`} />
        <Kpi
          label="Recebido (a pagar)"
          value={brl(aPagar)}
          hint={`${pendentes.length} aguardando sua autorização`}
        />
        <Kpi label="Total do documento atual" value={brl(total)} hint={`${lines.length} itens`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="card-surface space-y-4 p-5">
          <div className="flex items-center gap-2">
            <Truck className="size-5 text-primary" />
            <p className="text-sm font-bold">Venda / transferência para loja</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Loja de destino</Label>
              <Select value={to} onValueChange={setTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha a loja" />
                </SelectTrigger>
                <SelectContent>
                  {destinos.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Documento</Label>
              <Input value={doc} onChange={(e) => setDoc(e.target.value)} placeholder="TR-001" />
            </div>
            <div className="space-y-2">
              <Label>Data</Label>
              <Input type="date" value={issued} onChange={(e) => setIssued(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Adicionar produto</Label>
            <Select value={pick} onValueChange={addLine}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o produto da loja de origem" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · saldo {Number(p.stock_qty)} ·{" "}
                    {brl(Number(p.wholesale_price_cents) || Number(p.cost_cents))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 text-left font-medium">Produto</th>
                  <th className="p-3 text-left font-medium">Qtd</th>
                  <th className="p-3 text-left font-medium">Valor unit. (R$)</th>
                  <th className="p-3 text-right font-medium">Total</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((l, i) => {
                  const saldo = Number(
                    products.find((p) => p.id === l.product_id)?.stock_qty ?? 0,
                  );
                  const qty = Number(l.quantity.replace(",", ".") || 0);
                  return (
                    <tr key={l.product_id}>
                      <td className="p-3">
                        <p className="font-medium">{l.name}</p>
                        <p className="text-xs text-muted-foreground">
                          saldo na origem: {saldo}
                          {qty > saldo ? " · quantidade acima do saldo" : ""}
                        </p>
                      </td>
                      <td className="p-3">
                        <Input
                          className="w-24"
                          value={l.quantity}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((x, j) =>
                                j === i ? { ...x, quantity: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="p-3">
                        <Input
                          className="w-28"
                          value={l.unit}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)),
                            )
                          }
                        />
                      </td>
                      <td className="p-3 text-right font-semibold">
                        {brl(Math.round(qty * parseBRLToCents(l.unit)))}
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            setLines((prev) => prev.filter((_, j) => j !== i))
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {lines.length === 0 ? (
                  <tr>
                    <td className="p-6 text-sm text-muted-foreground" colSpan={5}>
                      Nenhum produto adicionado.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm">
              Total: <span className="text-lg font-black">{brl(total)}</span>
            </p>
            <div className="ml-auto flex gap-2">
              <Button
                variant="outline"
                disabled={save.isPending}
                onClick={() => save.mutate(false)}
              >
                Salvar rascunho
              </Button>
              <Button disabled={save.isPending} onClick={() => save.mutate(true)}>
                <CheckCircle2 className="mr-1 size-4" /> Enviar para autorização
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Ao enviar: baixa no estoque da loja de origem e venda lançada para a origem. A
            mercadoria só entra na loja de destino depois que o gestor dela autorizar, e o
            lançamento no destino é apenas uma conta a pagar.
          </p>
        </div>

        <div className="card-surface h-fit p-5">
          <p className="mb-3 text-sm font-bold">Preço de venda para loja</p>
          <p className="mb-3 text-xs text-muted-foreground">
            Defina o valor de repasse de cada produto. Ele é sugerido automaticamente na
            transferência.
          </p>
          <div className="max-h-[420px] space-y-2 overflow-y-auto">
            {products.map((p) => (
              <WholesaleRow key={p.id} product={p as any} />
            ))}
          </div>
        </div>
      </div>

      <div className="card-surface overflow-x-auto">
        <div className="flex items-center gap-2 border-b border-border p-4">
          <StoreIcon className="size-4 text-muted-foreground" />
          <p className="text-sm font-bold">Histórico de transferências</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="p-3 text-left font-medium">Data</th>
              <th className="p-3 text-left font-medium">Documento</th>
              <th className="p-3 text-left font-medium">Origem → Destino</th>
              <th className="p-3 text-right font-medium">Itens</th>
              <th className="p-3 text-right font-medium">Total</th>
              <th className="p-3 text-left font-medium">Situação</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {transfers.map((t) => (
              <Fragment key={t.id}>
              <tr>
                <td className="p-3">{shortDate(t.issued_at)}</td>
                <td className="p-3">{t.doc_number ?? "—"}</td>
                <td className="p-3">
                  {storeName(t.from_store_id)} → {storeName(t.to_store_id)}
                </td>
                <td className="p-3 text-right">{t.transfer_items?.length ?? 0}</td>
                <td className="p-3 text-right font-semibold">{brl(Number(t.total_cents))}</td>
                <td className="p-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      t.status === "approved"
                        ? t.payment_status === "paid"
                          ? "bg-emerald-500/12 text-emerald-600"
                          : "bg-chart-4/12 text-chart-4"
                        : t.status === "sent"
                          ? "bg-chart-3/15 text-chart-3"
                          : t.status === "rejected"
                            ? "bg-destructive/12 text-destructive"
                            : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {t.status === "approved"
                      ? t.payment_status === "paid"
                        ? "Autorizada · paga"
                        : "Autorizada · a pagar"
                      : t.status === "sent"
                        ? "Aguardando autorização"
                        : t.status === "rejected"
                          ? "Recusada"
                          : "Rascunho"}
                  </span>
                  {t.status === "rejected" && t.rejected_reason ? (
                    <p className="mt-1 text-xs text-muted-foreground">{t.rejected_reason}</p>
                  ) : null}
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    {t.status === "draft" && t.from_store_id === origin ? (
                      <Button size="sm" variant="outline" onClick={() => enviar.mutate(t.id)}>
                        Enviar
                      </Button>
                    ) : null}
                    {t.status === "sent" && t.to_store_id === origin ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() => {
                            setConferindo(conferindo === t.id ? null : t.id);
                            setRecv({});
                          }}
                        >
                          {conferindo === t.id ? "Fechar conferência" : "Conferir e autorizar"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => recusar.mutate(t.id)}>
                          Recusar
                        </Button>
                      </>
                    ) : null}
                    {t.status === "sent" && t.from_store_id === origin ? (
                      <span className="text-xs text-muted-foreground">
                        aguardando o gestor da loja
                      </span>
                    ) : null}
                    {t.status === "approved" && t.payment_status !== "paid" ? (
                      <Button size="sm" variant="ghost" onClick={() => marcarPago.mutate(t.id)}>
                        Marcar como paga
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
              {conferindo === t.id ? (
                <tr key={`${t.id}-conf`} className="bg-muted/40">
                  <td colSpan={7} className="p-4">
                    <p className="mb-3 text-sm font-bold">
                      Conferência de recebimento — informe o que chegou de fato
                    </p>
                    <div className="space-y-2">
                      {(t.transfer_items ?? []).map((it: any) => (
                        <div
                          key={it.id}
                          className="flex items-center gap-3 rounded-xl border border-border bg-background p-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{it.name}</p>
                            <p className="text-xs text-muted-foreground">
                              enviado {Number(it.quantity)} · {brl(Number(it.unit_price_cents))} un
                            </p>
                          </div>
                          <Input
                            className="w-24"
                            value={recv[it.id] ?? String(Number(it.quantity))}
                            onChange={(e) =>
                              setRecv((p) => ({ ...p, [it.id]: e.target.value }))
                            }
                          />
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        disabled={autorizar.isPending}
                        onClick={() => autorizar.mutate(t)}
                      >
                        <CheckCircle2 className="mr-1 size-4" />
                        Autorizar entrada no estoque
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        A entrada é automática nos produtos já cadastrados da loja (por SKU ou
                        nome). Diferenças voltam para o estoque da matriz.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : null}
              </Fragment>
            ))}

            {transfers.length === 0 ? (
              <tr>
                <td className="p-6 text-sm text-muted-foreground" colSpan={7}>
                  Nenhuma transferência registrada.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card-surface p-5">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function WholesaleRow({
  product,
}: {
  product: { id: string; name: string; wholesale_price_cents: number; cost_cents: number };
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState(
    (Number(product.wholesale_price_cents) / 100).toFixed(2).replace(".", ","),
  );

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("products")
        .update({ wholesale_price_cents: parseBRLToCents(value) })
        .eq("id", product.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Preço para loja atualizado");
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border p-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{product.name}</p>
        <p className="text-xs text-muted-foreground">
          custo médio {brl(Number(product.cost_cents))}
        </p>
      </div>
      <Input
        className="w-24"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => save.mutate()}
      />
    </div>
  );
}
