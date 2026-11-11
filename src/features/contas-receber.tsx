import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId, useStore } from "@/lib/store";
import { brl, parseBRLToCents, shortDate } from "@/lib/format";
import { PAYMENT_METHODS, methodLabel } from "@/lib/smartpag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Filtro = "aberto" | "vencidas" | "recebidas" | "todas";

const FILTROS: { key: Filtro; label: string }[] = [
  { key: "aberto", label: "Em aberto" },
  { key: "vencidas", label: "Vencidas" },
  { key: "recebidas", label: "Recebidas" },
  { key: "todas", label: "Todas" },
];

const hoje = () => new Date().toISOString().slice(0, 10);

export function ContasReceber() {
  const qc = useQueryClient();
  const { stores } = useStore();
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");
  const [dueDate, setDueDate] = useState(hoje());
  const [storeId, setStoreId] = useState(currentStoreId());
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [filtro, setFiltro] = useState<Filtro>("aberto");

  const { data: contas = [] } = useQuery({
    queryKey: ["receivables", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("receivables")
        .select("id, description, amount_cents, due_date, received, received_at, payment_method")
        .eq("store_id", storeId)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["receivables"] });
    qc.invalidateQueries({ queryKey: ["bi-geral"] });
  };

  const criar = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Usuário não autenticado");
      const { error } = await supabase.from("receivables").insert({
        user_id: auth.user.id,
        store_id: storeId,
        description: description.trim(),
        amount_cents: parseBRLToCents(value),
        due_date: dueDate,
        payment_method: paymentMethod,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDescription("");
      setValue("");
      invalidate();
      toast.success("Conta lançada");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const receber = useMutation({
    mutationFn: async ({ id, received }: { id: string; received: boolean }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("receivables")
        .update({
          received,
          received_at: received ? new Date().toISOString() : null,
          received_by: received ? (auth.user?.id ?? null) : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      invalidate();
      toast.success(variables.received ? "Recebimento confirmado" : "Baixa desfeita");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("receivables").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const hj = hoje();
  const kpis = useMemo(() => {
    const abertas = contas.filter((conta) => !conta.received);
    const soma = (lista: typeof contas) => lista.reduce((total, conta) => total + Number(conta.amount_cents), 0);
    const mes = hj.slice(0, 7);
    return {
      vencidas: soma(abertas.filter((conta) => conta.due_date < hj)),
      hoje: soma(abertas.filter((conta) => conta.due_date === hj)),
      aReceber: soma(abertas.filter((conta) => conta.due_date > hj)),
      recebidoMes: soma(contas.filter((conta) => conta.received && String(conta.received_at ?? "").slice(0, 7) === mes)),
    };
  }, [contas, hj]);

  const lista = contas.filter((conta) => {
    if (filtro === "recebidas") return conta.received;
    if (filtro === "aberto") return !conta.received;
    if (filtro === "vencidas") return !conta.received && conta.due_date < hj;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card-surface p-5"><p className="text-xs text-muted-foreground">Vencidas</p><p className="mt-1 text-2xl font-black text-destructive">{brl(kpis.vencidas)}</p></div>
        <div className="card-surface p-5"><p className="text-xs text-muted-foreground">Vencem hoje</p><p className="mt-1 text-2xl font-black text-chart-4">{brl(kpis.hoje)}</p></div>
        <div className="card-surface p-5"><p className="text-xs text-muted-foreground">A receber</p><p className="mt-1 text-2xl font-black">{brl(kpis.aReceber)}</p></div>
        <div className="card-surface p-5"><p className="text-xs text-muted-foreground">Recebido no mês</p><p className="mt-1 text-2xl font-black text-chart-2">{brl(kpis.recebidoMes)}</p></div>
      </div>

      <div className="card-surface flex flex-wrap items-end gap-3 p-5">
        <div className="w-56 space-y-2">
          <Label>Loja</Label>
          <Select value={storeId} onValueChange={setStoreId}>
            <SelectTrigger><SelectValue placeholder="Selecione a loja" /></SelectTrigger>
            <SelectContent>{stores.map((store) => <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="w-64 space-y-2"><Label>Descrição</Label><Input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={120} /></div>
        <div className="w-32 space-y-2"><Label>Valor</Label><Input value={value} onChange={(event) => setValue(event.target.value)} placeholder="0,00" inputMode="numeric" /></div>
        <div className="w-44 space-y-2"><Label>Vencimento</Label><Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div>
        <div className="w-44 space-y-2">
          <Label>Forma de pagamento</Label>
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{PAYMENT_METHODS.map((method) => <SelectItem key={method.id} value={method.id}>{method.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button disabled={!description.trim() || !storeId || !parseBRLToCents(value) || criar.isPending} onClick={() => criar.mutate()}>Lançar conta</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((item) => <Button key={item.key} type="button" size="sm" variant={filtro === item.key ? "default" : "outline"} onClick={() => setFiltro(item.key)}>{item.label}</Button>)}
      </div>

      <div className="card-surface divide-y divide-border">
        {lista.length === 0 && <p className="p-10 text-center text-sm text-muted-foreground">Nenhuma conta neste filtro.</p>}
        {lista.map((conta) => {
          const atrasada = !conta.received && conta.due_date < hj;
          return (
            <div key={conta.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div>
                <p className="font-semibold">{conta.description}</p>
                <p className={`text-xs ${atrasada ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                  {stores.find((store) => store.id === storeId)?.name} · {methodLabel(conta.payment_method ?? "outros")} · vence {shortDate(conta.due_date)}
                  {atrasada ? " · vencida" : ""}{conta.received && conta.received_at ? ` · recebida em ${shortDate(conta.received_at)}` : ""}
                </p>
              </div>
              <span className="ml-auto font-bold">{brl(Number(conta.amount_cents))}</span>
              <Button size="sm" variant={conta.received ? "outline" : "default"} disabled={receber.isPending} onClick={() => receber.mutate({ id: conta.id, received: !conta.received })}>{conta.received ? "Desfazer baixa" : "Marcar recebida"}</Button>
              <Button type="button" size="icon" variant="ghost" onClick={() => remover.mutate(conta.id)} className="text-muted-foreground hover:text-destructive" aria-label="Excluir conta"><Trash2 className="size-4" /></Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
