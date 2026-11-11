import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId } from "@/lib/store";
import { brl, parseBRLToCents, shortDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

type Kind = "diaria" | "dobra" | "gratificacao" | "comissao" | "consumo" | "vale" | "desconto";

const KINDS: { id: Kind; label: string; sign: 1 | -1 }[] = [
  { id: "diaria", label: "Diária", sign: 1 },
  { id: "dobra", label: "Dobra", sign: 1 },
  { id: "gratificacao", label: "Gratificação", sign: 1 },
  { id: "comissao", label: "Comissão", sign: 1 },
  { id: "consumo", label: "Consumo", sign: -1 },
  { id: "vale", label: "Vale / adiantamento", sign: -1 },
  { id: "desconto", label: "Desconto", sign: -1 },
];

const kindLabel = (k: string) => KINDS.find((x) => x.id === k)?.label ?? k;
const kindSign = (k: string) => KINDS.find((x) => x.id === k)?.sign ?? 1;

const today = () => new Date().toISOString().slice(0, 10);
const firstOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

export function ContaFuncionario() {
  const qc = useQueryClient();
  const [employeeId, setEmployeeId] = useState("");
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [kind, setKind] = useState<Kind>("diaria");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [refDate, setRefDate] = useState(today());

  const { data: employees = [] } = useQuery({
    queryKey: ["employees", "conta"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, name, job_title, active")
        .eq("store_id", currentStoreId())
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const selected = employeeId || employees[0]?.id || "";

  const { data: entries = [] } = useQuery({
    queryKey: ["employee-entries", selected, from, to],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_entries")
        .select("*")
        .eq("employee_id", selected)
        .gte("ref_date", from)
        .lte("ref_date", to)
        .order("ref_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const totals = useMemo(() => {
    const by: Record<string, number> = {};
    let credit = 0;
    let debit = 0;
    for (const e of entries) {
      const v = Number(e.amount_cents || 0);
      by[e.kind] = (by[e.kind] ?? 0) + v;
      if (kindSign(e.kind) === 1) credit += v;
      else debit += v;
    }
    return { by, credit, debit, saldo: credit - debit };
  }, [entries]);

  const add = useMutation({
    mutationFn: async () => {
      const cents = parseBRLToCents(amount);
      if (!selected) throw new Error("Selecione um funcionário");
      if (cents <= 0) throw new Error("Informe o valor");
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("employee_entries").insert({
        user_id: auth.user!.id,
        store_id: currentStoreId(),
        employee_id: selected,
        kind,
        description: description.trim() || kindLabel(kind),
        amount_cents: cents,
        ref_date: refDate,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDescription("");
      setAmount("");
      qc.invalidateQueries({ queryKey: ["employee-entries"] });
      toast.success("Lançamento registrado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patch = useMutation({
    mutationFn: async ({ id, paid }: { id: string; paid: boolean }) => {
      const { error } = await supabase.from("employee_entries").update({ paid }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employee-entries"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employee_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employee-entries"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const pending = entries
    .filter((e) => !e.paid && kindSign(e.kind) === 1)
    .reduce((s, e) => s + Number(e.amount_cents || 0), 0);

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-end gap-3 p-5">
        <div className="w-64 space-y-2">
          <Label>Funcionário</Label>
          <select
            value={selected}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            {employees.length === 0 && <option value="">Nenhum funcionário</option>}
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} — {e.job_title}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label>De</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Até</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Diárias", value: totals.by["diaria"] ?? 0 },
          { label: "Dobras", value: totals.by["dobra"] ?? 0 },
          { label: "Gratificações", value: totals.by["gratificacao"] ?? 0 },
          { label: "Comissões", value: totals.by["comissao"] ?? 0 },
          { label: "Consumo", value: totals.by["consumo"] ?? 0 },
          { label: "Vales / adiantamentos", value: totals.by["vale"] ?? 0 },
          { label: "Descontos", value: totals.by["desconto"] ?? 0 },
        ].map((c) => (
          <Card key={c.label} className="p-4">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="mt-1 text-lg font-bold">{brl(c.value)}</p>
          </Card>
        ))}
        <Card className="border-primary/40 bg-primary/5 p-4">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Wallet className="size-3.5" /> Saldo a pagar
          </p>
          <p className="mt-1 text-lg font-bold text-primary">{brl(totals.saldo)}</p>
          <p className="text-[11px] text-muted-foreground">
            {brl(pending)} ainda não pagos no período
          </p>
        </Card>
      </div>

      <Card className="flex flex-wrap items-end gap-3 p-5">
        <div className="w-48 space-y-2">
          <Label>Tipo</Label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <div className="w-64 space-y-2">
          <Label>Descrição</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex.: dobra do sábado"
            maxLength={120}
          />
        </div>
        <div className="w-36 space-y-2">
          <Label>Valor</Label>
          <Input
            value={amount}
            inputMode="numeric"
            placeholder="R$ 0,00"
            onChange={(e) => setAmount(brl(parseBRLToCents(e.target.value)))}
          />
        </div>
        <div className="space-y-2">
          <Label>Data</Label>
          <Input type="date" value={refDate} onChange={(e) => setRefDate(e.target.value)} />
        </div>
        <Button disabled={!selected || add.isPending} onClick={() => add.mutate()}>
          Lançar
        </Button>
      </Card>

      <Card className="divide-y divide-border">
        {entries.length === 0 && (
          <p className="p-10 text-center text-sm text-muted-foreground">
            Nenhum lançamento no período.
          </p>
        )}
        {entries.map((e) => (
          <div key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <span className="w-24 text-xs text-muted-foreground">{shortDate(e.ref_date)}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold">
              {kindLabel(e.kind)}
            </span>
            <span className="text-sm">{e.description}</span>
            <span
              className={`ml-auto font-semibold ${
                kindSign(e.kind) === 1 ? "text-foreground" : "text-destructive"
              }`}
            >
              {kindSign(e.kind) === 1 ? "" : "-"}
              {brl(Number(e.amount_cents || 0))}
            </span>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={e.paid}
                onCheckedChange={(v) => patch.mutate({ id: e.id, paid: !!v })}
              />
              Pago
            </label>
            <button
              onClick={() => remove.mutate(e.id)}
              className="text-muted-foreground transition-colors hover:text-destructive"
              aria-label="Excluir lançamento"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </Card>
    </div>
  );
}
