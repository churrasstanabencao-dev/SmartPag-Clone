import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Loader2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId } from "@/lib/store";
import { brl, shortDate } from "@/lib/format";
import { gerarProvisionamento, baixarProvisoes } from "@/lib/provisionamento.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

const thisMonth = () => new Date().toISOString().slice(0, 7);

export function Provisionamento() {
  const qc = useQueryClient();
  const [refMonth, setRefMonth] = useState(thisMonth());
  const [selected, setSelected] = useState<string[]>([]);
  const [parecer, setParecer] = useState("");

  const gerar = useServerFn(gerarProvisionamento);
  const baixar = useServerFn(baixarProvisoes);

  const firstDay = `${refMonth}-01`;

  const { data: provs = [], isLoading } = useQuery({
    queryKey: ["provisoes", refMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("id,description,amount_cents,category,due_date,paid")
        .eq("store_id", currentStoreId())
        .eq("ref_month", firstDay)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const totals = useMemo(() => {
    const total = provs.reduce((s, p) => s + Number(p.amount_cents), 0);
    const pago = provs.filter((p) => p.paid).reduce((s, p) => s + Number(p.amount_cents), 0);
    return { total, pago, aberto: total - pago };
  }, [provs]);

  const abertos = provs.filter((p) => !p.paid);

  const gerarMut = useMutation({
    mutationFn: async () =>
      gerar({ data: { storeId: currentStoreId(), refMonth } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["provisoes"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success(
        r.created > 0
          ? `${r.created} provisões lançadas (${brl(r.total)})`
          : "Nada novo para provisionar neste mês",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const baixaMut = useMutation({
    mutationFn: async (ids?: string[]) =>
      baixar({
        data: {
          storeId: currentStoreId(),
          refMonth,
          ...(ids?.length ? { ids } : { onlyDue: true }),
        },
      }),
    onSuccess: (r) => {
      setSelected([]);
      setParecer(r.parecer);
      qc.invalidateQueries({ queryKey: ["provisoes"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success(
        r.baixados > 0
          ? `${r.baixados} contas baixadas (${brl(r.valorBaixado)})`
          : "Nenhuma conta vencida para dar baixa",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = gerarMut.isPending || baixaMut.isPending;

  return (
    <div className="space-y-6">
      <div className="card-surface flex flex-wrap items-end gap-3 p-5">
        <div className="w-44 space-y-2">
          <Label>Mês de referência</Label>
          <Input type="month" value={refMonth} onChange={(e) => setRefMonth(e.target.value)} />
        </div>
        <Button disabled={busy} onClick={() => gerarMut.mutate()}>
          {gerarMut.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Wand2 className="mr-2 size-4" />
          )}
          Provisionar o mês
        </Button>
        <Button
          variant="secondary"
          disabled={busy || abertos.length === 0}
          onClick={() => baixaMut.mutate(selected.length ? selected : undefined)}
        >
          {baixaMut.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 size-4" />
          )}
          {selected.length
            ? `Assistente dar baixa (${selected.length})`
            : "Assistente dar baixa nas vencidas"}
        </Button>
        <p className="w-full text-xs text-muted-foreground">
          O provisionamento repete as contas do mês anterior e a folha dos funcionários mensalistas.
          O Agente Financeiro confirma as baixas e comenta o impacto no caixa.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card-surface p-5">
          <p className="text-xs text-muted-foreground">Provisionado</p>
          <p className="mt-1 text-2xl font-black">{brl(totals.total)}</p>
        </div>
        <div className="card-surface p-5">
          <p className="text-xs text-muted-foreground">Baixado</p>
          <p className="mt-1 text-2xl font-black text-chart-2">{brl(totals.pago)}</p>
        </div>
        <div className="card-surface p-5">
          <p className="text-xs text-muted-foreground">Em aberto</p>
          <p className="mt-1 text-2xl font-black text-destructive">{brl(totals.aberto)}</p>
        </div>
      </div>

      {parecer && (
        <div className="card-surface space-y-2 border-l-4 border-l-primary p-5">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4" /> Agente Financeiro
          </p>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{parecer}</p>
        </div>
      )}

      <div className="card-surface divide-y divide-border">
        {isLoading && <p className="p-10 text-center text-sm text-muted-foreground">Carregando...</p>}
        {!isLoading && provs.length === 0 && (
          <p className="p-10 text-center text-sm text-muted-foreground">
            Nenhuma provisão para {refMonth}. Clique em “Provisionar o mês”.
          </p>
        )}
        {provs.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <Checkbox
              checked={selected.includes(p.id)}
              disabled={p.paid}
              onCheckedChange={(v) =>
                setSelected((s) => (v ? [...s, p.id] : s.filter((x) => x !== p.id)))
              }
              aria-label={`Selecionar ${p.description}`}
            />
            <div>
              <p className="font-semibold">{p.description}</p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <CalendarClock className="size-3" />
                {p.category} · vence {shortDate(p.due_date)}
              </p>
            </div>
            <span className="ml-auto font-bold">{brl(Number(p.amount_cents))}</span>
            <span
              className={
                p.paid
                  ? "rounded-full bg-chart-2/15 px-3 py-1 text-xs font-semibold text-chart-2"
                  : "rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground"
              }
            >
              {p.paid ? "Baixado" : "Em aberto"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
