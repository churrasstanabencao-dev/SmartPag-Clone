import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Users, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId } from "@/lib/store";
import { SectionTitle } from "@/components/AppShell";
import { ComissoesEquipe } from "@/features/comissoes-equipe";
import { ContaFuncionario } from "@/features/conta-funcionario";
import { Salarios } from "@/features/salarios";
import { BiEquipe } from "@/features/bi-equipe";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/funcionarios")({
  head: () => ({
    meta: [
      { title: "Funcionários e comissões — SmartPag" },
      {
        name: "description",
        content:
          "Cadastre a equipe com cargo, PIN e percentual de comissão, e acompanhe as vendas de cada garçom.",
      },
      { property: "og:title", content: "Funcionários e comissões — SmartPag" },
      {
        property: "og:description",
        content: "Equipe, cargos, PIN de acesso e relatório de comissões por funcionário.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Funcionarios,
});

function Funcionarios() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"equipe" | "comissoes" | "conta" | "salarios" | "bi">("equipe");
  const [name, setName] = useState("");
  const [job, setJob] = useState("");
  const [pin, setPin] = useState("");
  const [pct, setPct] = useState("");

  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("*")
        .eq("store_id", currentStoreId()).order("name");
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("employees").insert({
        user_id: auth.user!.id,
        store_id: currentStoreId(),
        name: name.trim(),
        job_title: job.trim() || "atendente",
        pin: pin.trim() || null,
        commission_pct: Number(pct.replace(",", ".")) || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setName("");
      setJob("");
      setPin("");
      setPct("");
      qc.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Funcionário cadastrado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: { active?: boolean; commission_pct?: number };
    }) => {
      const { error } = await supabase.from("employees").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });

  return (
    <div className="space-y-6">
      <SectionTitle icon={Users} tone="bg-chart-6/15 text-chart-6">
        Funcionários
      </SectionTitle>

      <div className="flex gap-2 border-b border-border">
        {([
          { id: "equipe", label: "Equipe" },
          { id: "comissoes", label: "Comissões" },
          { id: "conta", label: "Conta do funcionário" },
          { id: "salarios", label: "Salários" },
          { id: "bi", label: "BI & Relatórios" },
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

      {tab === "bi" ? (
        <BiEquipe />
      ) : tab === "comissoes" ? (
        <ComissoesEquipe />
      ) : tab === "conta" ? (
        <ContaFuncionario />
      ) : tab === "salarios" ? (
        <Salarios />
      ) : (
        <>
          <div className="card-surface flex flex-wrap items-end gap-3 p-5">
            <div className="w-56 space-y-2">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </div>
            <div className="w-44 space-y-2">
              <Label>Cargo</Label>
              <Input
                value={job}
                onChange={(e) => setJob(e.target.value)}
                placeholder="atendente"
                maxLength={40}
              />
            </div>
            <div className="w-28 space-y-2">
              <Label>PIN</Label>
              <Input
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
              />
            </div>
            <div className="w-28 space-y-2">
              <Label>Comissão (%)</Label>
              <Input
                value={pct}
                inputMode="decimal"
                placeholder="10"
                onChange={(e) => setPct(e.target.value)}
              />
            </div>
            <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
              Adicionar
            </Button>
          </div>

          <div className="card-surface divide-y divide-border">
            {employees.length === 0 && (
              <p className="p-10 text-center text-sm text-muted-foreground">
                Nenhum funcionário cadastrado.
              </p>
            )}
            {employees.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div>
                  <p className="font-semibold">{e.name}</p>
                  <p className="text-xs text-muted-foreground">{e.job_title}</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Comissão</span>
                  <Input
                    className="h-9 w-20"
                    inputMode="decimal"
                    defaultValue={String(Number(e.commission_pct ?? 0))}
                    onBlur={(ev) =>
                      update.mutate({
                        id: e.id,
                        patch: {
                          commission_pct:
                            Number(ev.target.value.replace(",", ".")) || 0,
                        },
                      })
                    }
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  PIN {e.pin ? "••••" : "—"}
                </span>
                <Switch
                  checked={e.active}
                  onCheckedChange={(v) => update.mutate({ id: e.id, patch: { active: v } })}
                />
                <button
                  onClick={() => remove.mutate(e.id)}
                  className="text-muted-foreground transition-colors hover:text-destructive"
                  aria-label="Excluir funcionário"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
