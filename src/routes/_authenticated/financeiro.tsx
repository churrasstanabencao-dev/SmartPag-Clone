import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Wallet, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId } from "@/lib/store";
import { brl, parseBRLToCents, shortDate } from "@/lib/format";
import { EXPENSE_CATEGORIES } from "@/lib/smartpag";
import { SectionTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Provisionamento } from "@/features/provisionamento";
import { BiFinanceiro } from "@/features/bi-financeiro";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro — SmartPag" },
      {
        name: "description",
        content:
          "Controle despesas, contas a pagar e o resultado do mês do seu estabelecimento.",
      },
      { property: "og:title", content: "Financeiro — SmartPag" },
      {
        property: "og:description",
        content: "Receitas, despesas e resultado do mês.",
      },
    ],
  }),
  component: Financeiro,
});

function Financeiro() {
  const qc = useQueryClient();
  const [desc, setDesc] = useState("");
  const [value, setValue] = useState("");
  const [cat, setCat] = useState<string>("geral");
  const [due, setDue] = useState(new Date().toISOString().slice(0, 10));

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("store_id", currentStoreId())
        .order("due_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["payments", "month"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("store_id", currentStoreId())
        .gte("paid_at", monthStart.toISOString());
      if (error) throw error;
      return data;
    },
  });

  const revenue = payments.reduce((s, p) => s + Number(p.amount_cents), 0);
  const monthExpenses = expenses
    .filter((e) => e.due_date >= monthStart.toISOString().slice(0, 10))
    .reduce((s, e) => s + Number(e.amount_cents), 0);

  const create = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("expenses").insert({
        user_id: auth.user!.id,
        store_id: currentStoreId(),
        description: desc.trim(),
        amount_cents: parseBRLToCents(value),
        category: cat,
        due_date: due,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDesc("");
      setValue("");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Despesa lançada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePaid = useMutation({
    mutationFn: async ({ id, paid }: { id: string; paid: boolean }) => {
      const { error } = await supabase.from("expenses").update({ paid }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });

  return (
    <div className="space-y-6">
      <SectionTitle icon={Wallet} tone="bg-chart-3/15 text-chart-3">
        Financeiro
      </SectionTitle>

      <Tabs defaultValue="contas">
        <TabsList>
          <TabsTrigger value="contas">Contas a pagar</TabsTrigger>
          <TabsTrigger value="provisao">Provisionamento do mês</TabsTrigger>
          <TabsTrigger value="bi">BI & Relatórios</TabsTrigger>
        </TabsList>

        <TabsContent value="bi" className="mt-6">
          <BiFinanceiro />
        </TabsContent>

        <TabsContent value="provisao" className="mt-6">
          <Provisionamento />
        </TabsContent>

        <TabsContent value="contas" className="mt-6 space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card-surface p-5">
          <p className="text-xs text-muted-foreground">Receitas do mês</p>
          <p className="mt-1 text-2xl font-black text-chart-2">{brl(revenue)}</p>
        </div>
        <div className="card-surface p-5">
          <p className="text-xs text-muted-foreground">Despesas do mês</p>
          <p className="mt-1 text-2xl font-black text-destructive">{brl(monthExpenses)}</p>
        </div>
        <div className="card-surface p-5">
          <p className="text-xs text-muted-foreground">Resultado</p>
          <p className="mt-1 text-2xl font-black">{brl(revenue - monthExpenses)}</p>
        </div>
      </div>

      <div className="card-surface flex flex-wrap items-end gap-3 p-5">
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
        <div className="w-40 space-y-2">
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
        <div className="w-40 space-y-2">
          <Label>Vencimento</Label>
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        <Button disabled={!desc.trim() || create.isPending} onClick={() => create.mutate()}>
          Lançar
        </Button>
      </div>

      <div className="card-surface divide-y divide-border">
        {expenses.length === 0 && (
          <p className="p-10 text-center text-sm text-muted-foreground">
            Nenhuma despesa lançada.
          </p>
        )}
        {expenses.map((e) => (
          <div key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <div>
              <p className="font-semibold">{e.description}</p>
              <p className="text-xs text-muted-foreground">
                {e.category} · vence {shortDate(e.due_date)}
              </p>
            </div>
            <span className="ml-auto font-bold">{brl(Number(e.amount_cents))}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {e.paid ? "Pago" : "Em aberto"}
              </span>
              <Switch
                checked={e.paid}
                onCheckedChange={(v) => togglePaid.mutate({ id: e.id, paid: v })}
              />
            </div>
            <button
              onClick={() => remove.mutate(e.id)}
              className="text-muted-foreground transition-colors hover:text-destructive"
              aria-label="Excluir despesa"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
