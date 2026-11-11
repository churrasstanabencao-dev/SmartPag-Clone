import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackageMinus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId } from "@/lib/store";
import { brl, dateTime } from "@/lib/format";
import { expandirComponentes } from "@/lib/composicao";
import { SectionTitle } from "@/components/AppShell";
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

export const MOTIVOS_BAIXA = [
  { id: "perda_desperdicio", label: "Desperdício" },
  { id: "perda_quebra", label: "Quebra / avaria" },
  { id: "perda_vencimento", label: "Vencido / estragado" },
  { id: "perda_uso_interno", label: "Uso interno / consumo da equipe" },
  { id: "perda_cortesia", label: "Cortesia / brinde" },
  { id: "perda_extravio", label: "Extravio / furto" },
  { id: "ajuste_saida", label: "Ajuste de inventário" },
] as const;

export const motivoBaixaLabel = (id: string) =>
  MOTIVOS_BAIXA.find((m) => m.id === id)?.label ?? id;

type Linha = { productId: string; qty: number };

export function BaixaManualModule() {
  const qc = useQueryClient();
  const [motivo, setMotivo] = useState<string>("perda_desperdicio");
  const [obs, setObs] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [sel, setSel] = useState("");
  const [qty, setQty] = useState("1");
  const [days, setDays] = useState("30");

  const { data: products = [] } = useQuery({
    queryKey: ["products", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("store_id", currentStoreId())
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const since = useMemo(() => {
    const d = new Date(Date.now() - (Number(days) - 1) * 86400000);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [days]);

  const { data: baixas = [] } = useQuery({
    queryKey: ["stock_movements", "baixas", days],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("*")
        .eq("store_id", currentStoreId())
        .gte("created_at", since)
        .lt("quantity", 0)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []).filter((m) => m.reason.startsWith("perda_") || m.reason === "ajuste_saida");
    },
  });

  const productById = (id: string) => products.find((p) => p.id === id);
  const productName = (id: string) => productById(id)?.name ?? "Produto removido";

  const custoLinha = (l: Linha) =>
    Number(productById(l.productId)?.cost_cents ?? 0) * l.qty;
  const custoTotal = linhas.reduce((s, l) => s + custoLinha(l), 0);

  function addLinha() {
    const q = Number(qty.replace(",", ".")) || 0;
    if (!sel) {
      toast.error("Selecione um produto");
      return;
    }
    if (q <= 0) {
      toast.error("Informe uma quantidade válida");
      return;
    }
    setLinhas((prev) => {
      const i = prev.findIndex((l) => l.productId === sel);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { productId: sel, qty: next[i]!.qty + q };
        return next;
      }
      return [...prev, { productId: sel, qty: q }];
    });
    setSel("");
    setQty("1");
  }

  const registrar = useMutation({
    mutationFn: async () => {
      if (linhas.length === 0) throw new Error("Adicione pelo menos um item");
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user!.id;

      // produtos montados baixam os componentes
      const mapa = new Map<string, number>();
      for (const l of linhas)
        mapa.set(l.productId, (mapa.get(l.productId) ?? 0) + l.qty);
      const expandido = await expandirComponentes(mapa);

      const ids = [...expandido.keys()];
      const { data: prods, error } = await supabase
        .from("products")
        .select("id, name, stock_qty, track_stock")
        .in("id", ids);
      if (error) throw error;

      const reason = obs.trim() ? `${motivo} — ${obs.trim().slice(0, 120)}` : motivo;

      for (const [productId, q] of expandido) {
        const p = prods?.find((x) => x.id === productId);
        if (!p || q <= 0) continue;
        const { error: mvErr } = await supabase.from("stock_movements").insert({
          user_id: userId,
          store_id: currentStoreId(),
          product_id: productId,
          quantity: -q,
          reason,
        });
        if (mvErr) throw mvErr;
        const { error: upErr } = await supabase
          .from("products")
          .update({ stock_qty: Number(p.stock_qty) - q, track_stock: true })
          .eq("id", productId);
        if (upErr) throw upErr;
      }
    },
    onSuccess: () => {
      setLinhas([]);
      setObs("");
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      toast.success("Baixa registrada e estoque atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const custoDe = (productId: string, q: number) =>
    Number(productById(productId)?.cost_cents ?? 0) * q;

  const totalPeriodo = baixas.reduce(
    (s, m) => s + custoDe(m.product_id, Math.abs(Number(m.quantity))),
    0,
  );

  const porMotivo = useMemo(() => {
    const map = new Map<string, { qty: number; cents: number }>();
    for (const m of baixas) {
      const key = m.reason.split(" — ")[0]!;
      const q = Math.abs(Number(m.quantity));
      const cur = map.get(key) ?? { qty: 0, cents: 0 };
      map.set(key, { qty: cur.qty + q, cents: cur.cents + custoDe(m.product_id, q) });
    }
    return [...map.entries()].sort((a, b) => b[1].cents - a[1].cents);
  }, [baixas, products]);

  function exportarCSV() {
    const linhasCsv = [
      ["Data", "Produto", "Quantidade", "Motivo", "Custo"],
      ...baixas.map((m) => {
        const q = Math.abs(Number(m.quantity));
        return [
          dateTime(m.created_at),
          productName(m.product_id),
          String(q),
          m.reason.replace(m.reason.split(" — ")[0]!, motivoBaixaLabel(m.reason.split(" — ")[0]!)),
          (custoDe(m.product_id, q) / 100).toFixed(2),
        ];
      }),
    ];
    const csv = linhasCsv.map((l) => l.map((c) => `"${c}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `baixas-estoque-${days}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <SectionTitle icon={PackageMinus} tone="bg-destructive/10 text-destructive">
        Baixa manual de estoque
      </SectionTitle>

      <div className="card-surface space-y-4 p-5">
        <p className="text-xs text-muted-foreground">
          Registre itens que saíram sem venda: desperdício, quebra, vencimento,
          consumo da equipe ou cortesia. Produtos montados baixam automaticamente
          os componentes.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-60 space-y-2">
            <Label>Motivo</Label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOTIVOS_BAIXA.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-60 space-y-2">
            <Label>Produto</Label>
            <Select value={sel} onValueChange={setSel}>
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
          <div className="w-28 space-y-2">
            <Label>Quantidade</Label>
            <Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" />
          </div>
          <Button variant="secondary" onClick={addLinha}>
            <Plus className="size-4" /> Adicionar item
          </Button>
        </div>

        <div className="space-y-2">
          <Label>Observação (opcional)</Label>
          <Textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            maxLength={120}
            placeholder="Ex.: caiu no chão durante o preparo"
          />
        </div>

        <div className="divide-y divide-border rounded-xl border border-border">
          {linhas.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Nenhum item na baixa.
            </p>
          )}
          {linhas.map((l) => (
            <div key={l.productId} className="flex items-center gap-3 px-4 py-2">
              <span className="font-semibold">{productName(l.productId)}</span>
              <span className="ml-auto text-sm text-muted-foreground">
                {l.qty} {productById(l.productId)?.unit ?? "UN"}
              </span>
              <span className="w-24 text-right text-sm font-bold">
                {brl(custoLinha(l))}
              </span>
              <button
                onClick={() =>
                  setLinhas((prev) => prev.filter((x) => x.productId !== l.productId))
                }
                className="text-muted-foreground transition-colors hover:text-destructive"
                aria-label="Remover item"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <p className="text-sm">
            Custo da perda:{" "}
            <span className="text-lg font-black text-destructive">{brl(custoTotal)}</span>
          </p>
          <Button
            className="ml-auto"
            disabled={linhas.length === 0 || registrar.isPending}
            onClick={() => registrar.mutate()}
          >
            Registrar baixa
          </Button>
        </div>
      </div>

      <div className="card-surface p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-black uppercase tracking-wide text-muted-foreground">
            Perdas do período
          </h3>
          <div className="ml-auto flex items-center gap-2">
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="secondary" size="sm" onClick={exportarCSV} disabled={!baixas.length}>
              Exportar CSV
            </Button>
          </div>
        </div>

        <p className="mt-3 text-sm">
          Total perdido no período:{" "}
          <span className="text-xl font-black text-destructive">{brl(totalPeriodo)}</span>
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {porMotivo.map(([id, v]) => (
            <div key={id} className="rounded-xl border border-border p-3">
              <p className="text-xs font-semibold text-muted-foreground">
                {motivoBaixaLabel(id)}
              </p>
              <p className="text-lg font-black">{brl(v.cents)}</p>
              <p className="text-xs text-muted-foreground">{v.qty} item(ns)</p>
            </div>
          ))}
        </div>

        <div className="mt-4 divide-y divide-border rounded-xl border border-border">
          {baixas.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Nenhuma baixa manual no período.
            </p>
          )}
          {baixas.map((m) => {
            const q = Math.abs(Number(m.quantity));
            const base = m.reason.split(" — ")[0]!;
            const nota = m.reason.includes(" — ") ? m.reason.split(" — ")[1] : null;
            return (
              <div key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
                <div className="min-w-0">
                  <p className="font-semibold">{productName(m.product_id)}</p>
                  <p className="text-xs text-muted-foreground">
                    {motivoBaixaLabel(base)}
                    {nota ? ` · ${nota}` : ""} · {dateTime(m.created_at)}
                  </p>
                </div>
                <span className="ml-auto text-sm text-muted-foreground">-{q}</span>
                <span className="w-24 text-right font-bold text-destructive">
                  {brl(custoDe(m.product_id, q))}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
