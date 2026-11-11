import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId, useStore } from "@/lib/store";
import { brl, parseBRLToCents, shortDate } from "@/lib/format";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, methodLabel } from "@/lib/smartpag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Filtro = "aberto" | "vencidas" | "pagas" | "todas";
type Prazo = 7 | 30 | 60;

const FILTROS: { key: Filtro; label: string }[] = [
  { key: "aberto", label: "Em aberto" },
  { key: "vencidas", label: "Vencidas" },
  { key: "pagas", label: "Pagas" },
  { key: "todas", label: "Todas" },
];

const hoje = () => new Date().toISOString().slice(0, 10);

/** Contas a pagar: lançamentos com vencimento, baixa e reflexo automático no BI. */
export function ContasPagar() {
  const qc = useQueryClient();
  const { stores } = useStore();
  const [desc, setDesc] = useState("");
  const [value, setValue] = useState("");
  const [cat, setCat] = useState("geral");
  const [due, setDue] = useState(hoje());
  const [storeId, setStoreId] = useState(currentStoreId());
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [filtro, setFiltro] = useState<Filtro>("aberto");
  const [prazo, setPrazo] = useState<Prazo>(7);

  const { data: contas = [] } = useQuery({
    queryKey: ["expenses", "contas-pagar", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("id, description, amount_cents, category, due_date, paid, paid_at, payment_method")
        .eq("store_id", storeId)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["expenses"] });
    qc.invalidateQueries({ queryKey: ["bi-geral"] });
    qc.invalidateQueries({ queryKey: ["bi-financeiro"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const criar = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Usuário não autenticado");
      const { error } = await supabase.from("expenses").insert({
        user_id: auth.user.id,
        store_id: storeId,
        description: desc.trim(),
        amount_cents: parseBRLToCents(value),
        category: cat,
        due_date: due,
        payment_method: paymentMethod,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDesc("");
      setValue("");
      invalidate();
      toast.success("Conta lançada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const baixar = useMutation({
    mutationFn: async ({ id, paid }: { id: string; paid: boolean }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("expenses")
        .update({
          paid,
          paid_at: paid ? new Date().toISOString() : null,
          paid_by: paid ? (auth.user?.id ?? null) : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      invalidate();
      toast.success(v.paid ? "Conta paga" : "Baixa desfeita");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const hj = hoje();
  const kpis = useMemo(() => {
    const abertas = contas.filter((c) => !c.paid);
    const soma = (l: typeof contas) => l.reduce((s, c) => s + Number(c.amount_cents), 0);
    const mes = hj.slice(0, 7);
    return {
      vencidas: soma(abertas.filter((c) => c.due_date < hj)),
      hoje: soma(abertas.filter((c) => c.due_date === hj)),
      aVencer: soma(abertas.filter((c) => c.due_date > hj)),
      pagoMes: soma(contas.filter((c) => c.paid && String(c.paid_at ?? "").slice(0, 7) === mes)),
    };
  }, [contas, hj]);

  const lista = contas.filter((c) => {
    if (filtro === "pagas") return c.paid;
    if (filtro === "aberto") return !c.paid;
    if (filtro === "vencidas") return !c.paid && c.due_date < hj;
    return true;
  });

  const limite = new Date(`${hj}T12:00:00`);
  limite.setDate(limite.getDate() + prazo);
  const limiteIso = limite.toISOString().slice(0, 10);
  const proximosVencimentos = contas.filter(
    (c) => !c.paid && c.due_date >= hj && c.due_date <= limiteIso,
  );
  const totalProximosVencimentos = proximosVencimentos.reduce(
    (soma, conta) => soma + Number(conta.amount_cents),
    0,
  );

  const exportarVencimentos = () => {
    const loja = stores.find((store) => store.id === storeId)?.name ?? "Loja";
    const escapar = (valor: unknown) => `"${String(valor ?? "").replaceAll('"', '""')}"`;
    const linhas = proximosVencimentos.map((conta) =>
      [
        loja,
        conta.description,
        conta.category,
        methodLabel(conta.payment_method ?? "outros"),
        shortDate(conta.due_date),
        (Number(conta.amount_cents) / 100).toFixed(2).replace(".", ","),
      ]
        .map(escapar)
        .join(";"),
    );
    const csv = [
      ["Loja", "Descrição", "Categoria", "Forma de pagamento", "Vencimento", "Valor (R$)"]
        .map(escapar)
        .join(";"),
      ...linhas,
    ].join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    link.download = `contas-a-vencer-${prazo}-dias-${hj}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card-surface p-5">
          <p className="text-xs text-muted-foreground">Vencidas</p>
          <p className="mt-1 text-2xl font-black text-destructive">{brl(kpis.vencidas)}</p>
        </div>
        <div className="card-surface p-5">
          <p className="text-xs text-muted-foreground">Vencem hoje</p>
          <p className="mt-1 text-2xl font-black text-chart-4">{brl(kpis.hoje)}</p>
        </div>
        <div className="card-surface p-5">
          <p className="text-xs text-muted-foreground">A vencer</p>
          <p className="mt-1 text-2xl font-black">{brl(kpis.aVencer)}</p>
        </div>
        <div className="card-surface p-5">
          <p className="text-xs text-muted-foreground">Pago no mês</p>
          <p className="mt-1 text-2xl font-black text-chart-2">{brl(kpis.pagoMes)}</p>
        </div>
      </div>

      <div className="card-surface flex flex-wrap items-end gap-3 p-5">
        <div className="w-56 space-y-2">
          <Label>Loja</Label>
          <Select value={storeId} onValueChange={setStoreId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a loja" />
            </SelectTrigger>
            <SelectContent>
              {stores.map((store) => (
                <SelectItem key={store.id} value={store.id}>
                  {store.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-56 space-y-2">
          <Label>Descrição</Label>
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={120} />
        </div>
        <div className="w-32 space-y-2">
          <Label>Valor</Label>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0,00"
            inputMode="numeric"
          />
        </div>
        <div className="w-44 space-y-2">
          <Label>Categoria</Label>
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPENSE_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-44 space-y-2">
          <Label>Vencimento</Label>
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        <div className="w-44 space-y-2">
          <Label>Forma de pagamento</Label>
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((method) => (
                <SelectItem key={method.id} value={method.id}>
                  {method.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          disabled={!desc.trim() || !storeId || !parseBRLToCents(value) || criar.isPending}
          onClick={() => criar.mutate()}
        >
          Lançar conta
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Button
            key={f.key}
            type="button"
            size="sm"
            variant={filtro === f.key ? "default" : "outline"}
            onClick={() => setFiltro(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <section className="card-surface p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 className="font-bold">Próximos vencimentos</h2>
            <p className="text-sm text-muted-foreground">
              Contas em aberto que vencem nos próximos {prazo} dias.
            </p>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            {([7, 30, 60] as Prazo[]).map((dias) => (
              <Button
                key={dias}
                type="button"
                size="sm"
                variant={prazo === dias ? "default" : "outline"}
                onClick={() => setPrazo(dias)}
              >
                {dias} dias
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={proximosVencimentos.length === 0}
              onClick={exportarVencimentos}
            >
              <Download className="size-4" />
              Exportar CSV
            </Button>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground">
                <th className="py-2">Descrição</th>
                <th className="py-2">Vencimento</th>
                <th className="py-2">Forma de pagamento</th>
                <th className="py-2 text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {proximosVencimentos.map((conta) => (
                <tr key={conta.id}>
                  <td className="py-2 font-semibold">{conta.description}</td>
                  <td className="py-2">{shortDate(conta.due_date)}</td>
                  <td className="py-2">{methodLabel(conta.payment_method ?? "outros")}</td>
                  <td className="py-2 text-right font-bold">{brl(Number(conta.amount_cents))}</td>
                </tr>
              ))}
              {proximosVencimentos.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">
                    Nenhuma conta vence neste período.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-border">
                <td colSpan={3} className="py-2 font-black">Total</td>
                <td className="py-2 text-right font-black">{brl(totalProximosVencimentos)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <div className="card-surface divide-y divide-border">
        {lista.length === 0 && (
          <p className="p-10 text-center text-sm text-muted-foreground">
            Nenhuma conta neste filtro.
          </p>
        )}
        {lista.map((c) => {
          const atrasada = !c.paid && c.due_date < hj;
          return (
            <div key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div>
                <p className="font-semibold">{c.description}</p>
                <p
                  className={`text-xs ${atrasada ? "font-semibold text-destructive" : "text-muted-foreground"}`}
                >
                  {stores.find((store) => store.id === storeId)?.name} · {c.category} · {methodLabel(c.payment_method ?? "outros")} · vence {shortDate(c.due_date)}
                  {atrasada ? " · vencida" : ""}
                  {c.paid && c.paid_at ? ` · paga em ${shortDate(c.paid_at)}` : ""}
                </p>
              </div>
              <span className="ml-auto font-bold">{brl(Number(c.amount_cents))}</span>
              <Button
                size="sm"
                variant={c.paid ? "outline" : "default"}
                disabled={baixar.isPending}
                onClick={() => baixar.mutate({ id: c.id, paid: !c.paid })}
              >
                {c.paid ? "Desfazer baixa" : "Dar baixa"}
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => remover.mutate(c.id)}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Excluir conta"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
