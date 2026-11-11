import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LockKeyhole, ScrollText, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId } from "@/lib/store";
import { brl, dateTime } from "@/lib/format";
import { IconTile } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const DENOMINATIONS = [
  { cents: 20000, label: "R$ 200" },
  { cents: 10000, label: "R$ 100" },
  { cents: 5000, label: "R$ 50" },
  { cents: 2000, label: "R$ 20" },
  { cents: 1000, label: "R$ 10" },
  { cents: 500, label: "R$ 5" },
  { cents: 200, label: "R$ 2" },
  { cents: 100, label: "R$ 1" },
  { cents: 50, label: "R$ 0,50" },
  { cents: 25, label: "R$ 0,25" },
  { cents: 10, label: "R$ 0,10" },
  { cents: 5, label: "R$ 0,05" },
];

type Counts = Record<string, number>;

export function CashCountCard({
  registerId,
  expectedCash,
  onDone,
}: {
  registerId: string;
  expectedCash: number;
  onDone: () => void;
}) {
  const [counts, setCounts] = useState<Counts>({});
  const [notes, setNotes] = useState("");
  const [blind, setBlind] = useState(true);

  const counted = useMemo(
    () =>
      DENOMINATIONS.reduce(
        (s, d) => s + d.cents * (counts[String(d.cents)] ?? 0),
        0,
      ),
    [counts],
  );
  const difference = counted - expectedCash;

  const close = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("cash_registers")
        .update({
          status: "closed",
          closed_at: new Date().toISOString(),
          closing_counted_cents: counted,
          expected_cash_cents: expectedCash,
          difference_cents: difference,
          counted_breakdown: counts,
          closed_by: auth.user?.id ?? null,
          notes: notes.trim() || null,
        })
        .eq("id", registerId);
      if (error) throw error;
    },
    onSuccess: () => {
      setCounts({});
      setNotes("");
      onDone();
      toast.success("Caixa fechado com conferência registrada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="card-surface space-y-4 p-5">
      <div className="flex items-center gap-3">
        <IconTile icon={LockKeyhole} tone="bg-chart-4/12 text-chart-4" />
        <div>
          <h3 className="font-bold">Fechamento com conferência</h3>
          <p className="text-xs text-muted-foreground">
            Conte cédulas e moedas da gaveta.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {DENOMINATIONS.map((d) => (
          <div key={d.cents} className="flex items-center gap-2">
            <span className="w-20 text-xs font-semibold text-muted-foreground">
              {d.label}
            </span>
            <Input
              className="h-9"
              inputMode="numeric"
              value={counts[String(d.cents)] ?? ""}
              placeholder="0"
              onChange={(e) =>
                setCounts((c) => ({
                  ...c,
                  [String(d.cents)]: Number(e.target.value.replace(/\D/g, "")) || 0,
                }))
              }
            />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Label>Observações do turno</Label>
        <Input
          value={notes}
          maxLength={200}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex.: falta de troco, retirada extra..."
        />
      </div>

      <div className="rounded-xl bg-muted/60 p-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Contado</span>
          <span className="font-bold">{brl(counted)}</span>
        </div>
        <button
          type="button"
          onClick={() => setBlind((b) => !b)}
          className="mt-1 text-xs font-semibold text-primary"
        >
          {blind ? "Mostrar valor esperado" : "Ocultar valor esperado (cega)"}
        </button>
        {!blind && (
          <>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-muted-foreground">Esperado</span>
              <span className="font-bold">{brl(expectedCash)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-muted-foreground">
                {difference === 0 ? "Sem diferença" : difference > 0 ? "Sobra" : "Falta"}
              </span>
              <span
                className={`font-black ${
                  difference === 0
                    ? "text-chart-2"
                    : difference > 0
                      ? "text-chart-3"
                      : "text-destructive"
                }`}
              >
                {brl(difference)}
              </span>
            </div>
          </>
        )}
      </div>

      <Button
        variant="secondary"
        className="w-full"
        disabled={close.isPending || counted <= 0}
        onClick={() => close.mutate()}
      >
        Fechar caixa
      </Button>
    </div>
  );
}

export function ClosuresAudit() {
  const qc = useQueryClient();
  const { data: closures = [] } = useQuery({
    queryKey: ["cash_closures"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_registers")
        .select("*")
        .eq("store_id", currentStoreId())
        .eq("status", "closed")
        .order("closed_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data;
    },
  });
  void qc;

  const totalDiff = closures.reduce(
    (s, c) => s + Number(c.difference_cents ?? 0),
    0,
  );
  const withDiff = closures.filter((c) => Number(c.difference_cents ?? 0) !== 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Turnos fechados", value: String(closures.length) },
          { label: "Turnos com quebra", value: String(withDiff.length) },
          { label: "Quebra acumulada", value: brl(totalDiff) },
        ].map((c) => (
          <div key={c.label} className="card-surface p-5">
            <p className="text-xs font-semibold text-muted-foreground">{c.label}</p>
            <p className="mt-1 text-2xl font-black">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="card-surface">
        <div className="flex items-center gap-3 border-b border-border px-5 py-3">
          <IconTile icon={ScrollText} tone="bg-chart-1/12 text-chart-1" />
          <h3 className="font-bold">Auditoria de fechamentos</h3>
        </div>
        <div className="divide-y divide-border">
          {closures.length === 0 && (
            <p className="p-10 text-center text-sm text-muted-foreground">
              Nenhum caixa fechado ainda.
            </p>
          )}
          {closures.map((c) => {
            const diff = Number(c.difference_cents ?? 0);
            const breakdown = (c.counted_breakdown ?? null) as Counts | null;
            return (
              <div key={c.id} className="space-y-2 px-5 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <IconTile
                    icon={diff === 0 ? CheckCircle2 : AlertTriangle}
                    tone={
                      diff === 0
                        ? "bg-chart-2/12 text-chart-2"
                        : "bg-destructive/10 text-destructive"
                    }
                  />
                  <div>
                    <p className="text-sm font-semibold">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {dateTime(c.opened_at)} → {c.closed_at ? dateTime(c.closed_at) : "—"}
                    </p>
                  </div>
                  <div className="ml-auto grid grid-cols-3 gap-6 text-right">
                    <div>
                      <p className="text-[11px] text-muted-foreground">Esperado</p>
                      <p className="text-sm font-bold">
                        {brl(Number(c.expected_cash_cents ?? 0))}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Contado</p>
                      <p className="text-sm font-bold">
                        {brl(Number(c.closing_counted_cents ?? 0))}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Diferença</p>
                      <p
                        className={`text-sm font-black ${
                          diff === 0
                            ? "text-chart-2"
                            : diff > 0
                              ? "text-chart-3"
                              : "text-destructive"
                        }`}
                      >
                        {brl(diff)}
                      </p>
                    </div>
                  </div>
                </div>
                {breakdown && Object.values(breakdown).some((v) => Number(v) > 0) && (
                  <p className="text-xs text-muted-foreground">
                    Contagem:{" "}
                    {DENOMINATIONS.filter((d) => Number(breakdown[String(d.cents)] ?? 0) > 0)
                      .map((d) => `${breakdown[String(d.cents)]}x ${d.label}`)
                      .join(" · ")}
                  </p>
                )}
                {c.notes && (
                  <p className="text-xs text-muted-foreground">Obs.: {c.notes}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
