import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, Trash2, UserPlus, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { SectionTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store";
import { MODULES, usePermissions } from "@/lib/permissions";
import {
  createStoreUser,
  listStoreUsers,
  removeStoreUser,
  updateStoreUser,
} from "@/lib/usuarios.functions";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários e permissões | Grupo Vips" },
      {
        name: "description",
        content:
          "Cadastre usuários da loja e libere apenas os módulos que cada pessoa pode acessar.",
      },
      { property: "og:title", content: "Usuários e permissões | Grupo Vips" },
      {
        property: "og:description",
        content: "Controle de acesso por módulo para a equipe da loja.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UsuariosPage,
});

const PRESETS: Record<string, string[]> = {
  gestor: MODULES.map((m) => m.key).filter((k) => k !== "usuarios"),
  caixa: ["pdv", "dashboard"],
  estoquista: ["estoque", "cadastro"],
  garcom: ["pdv"],
};

function UsuariosPage() {
  const { storeId, store } = useStore();
  const { isOwner, loading } = usePermissions();
  const qc = useQueryClient();

  const list = useServerFn(listStoreUsers);
  const create = useServerFn(createStoreUser);
  const update = useServerFn(updateStoreUser);
  const remove = useServerFn(removeStoreUser);

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "caixa",
    modules: PRESETS['caixa'] as string[],
    employeeId: "",
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees", "usuarios", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, name, job_title")
        .eq("store_id", storeId!)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["store-users", storeId],
    enabled: !!storeId && isOwner,
    queryFn: () => list({ data: { storeId: storeId! } }),
  });

  const createUser = useMutation({
    mutationFn: () =>
      create({
        data: {
          storeId: storeId!,
          email: form.email,
          password: form.password,
          fullName: form.fullName,
          role: form.role,
          modules: form.modules,
          employeeId: form.employeeId || null,
        },
      }),
    onSuccess: () => {
      toast.success("Acesso criado");
      setForm({
        fullName: "",
        email: "",
        password: "",
        role: "caixa",
        modules: PRESETS['caixa']!,
        employeeId: "",
      });
      qc.invalidateQueries({ queryKey: ["store-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMember = useMutation({
    mutationFn: (v: {
      memberId: string;
      modules?: string[];
      active?: boolean;
      password?: string;
      employeeId?: string | null;
    }) => update({ data: { storeId: storeId!, ...v } }),
    onSuccess: () => {
      toast.success("Permissões atualizadas");
      qc.invalidateQueries({ queryKey: ["store-users"] });
      qc.invalidateQueries({ queryKey: ["my-modules"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMember = useMutation({
    mutationFn: (memberId: string) => remove({ data: { storeId: storeId!, memberId } }),
    onSuccess: () => {
      toast.success("Acesso removido");
      qc.invalidateQueries({ queryKey: ["store-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  if (!isOwner) {
    return (
      <Card className="p-6">
        <h1 className="text-lg font-bold">Acesso restrito</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Somente o dono da loja pode gerenciar usuários e permissões.
        </p>
      </Card>
    );
  }

  const toggle = (key: string) =>
    setForm((f) => ({
      ...f,
      modules: f.modules.includes(key)
        ? f.modules.filter((m) => m !== key)
        : [...f.modules, key],
    }));

  return (
    <div className="space-y-6">
      <SectionTitle icon={ShieldCheck}>Usuários e permissões</SectionTitle>
      <p className="-mt-4 text-sm text-muted-foreground">
        Acessos da loja <strong>{store?.name}</strong>. Cada usuário só enxerga os módulos
        marcados.
      </p>

      <Card className="space-y-4 p-5">
        <h2 className="flex items-center gap-2 font-bold">
          <UserPlus className="size-4" /> Novo usuário
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="mb-1 block text-xs">Nome</Label>
            <Input
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              placeholder="Nome do colaborador"
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs">E-mail de acesso</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="pessoa@loja.com"
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Senha inicial</Label>
            <Input
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="mínimo 6 caracteres"
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Perfil</Label>
            <select
              value={form.role}
              onChange={(e) =>
                setForm({
                  ...form,
                  role: e.target.value,
                  modules: PRESETS[e.target.value] ?? form.modules,
                })
              }
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="gestor">Gestor</option>
              <option value="caixa">Caixa / PDV</option>
              <option value="estoquista">Estoquista</option>
              <option value="garcom">Garçom</option>
              <option value="personalizado">Personalizado</option>
            </select>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Funcionário vinculado</Label>
            <select
              value={form.employeeId}
              onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Sem vínculo</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} — {e.job_title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <Label className="mb-2 block text-xs">Módulos liberados</Label>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {MODULES.map((m) => (
              <label key={m.key} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.modules.includes(m.key)}
                  onCheckedChange={() => toggle(m.key)}
                />
                {m.label}
              </label>
            ))}
          </div>
        </div>

        <Button
          onClick={() => createUser.mutate()}
          disabled={!form.email || createUser.isPending}
        >
          Criar acesso
        </Button>
      </Card>

      <Card className="divide-y divide-border">
        {members.length === 0 && (
          <p className="p-5 text-sm text-muted-foreground">Nenhum usuário cadastrado ainda.</p>
        )}
        {members.map((m) => (
          <div key={m.id} className="space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <p className="font-semibold">{m.full_name || m.email}</p>
                <p className="text-xs text-muted-foreground">
                  {m.email} · {m.role}
                </p>
              </div>
              <select
                value={m.employee_id ?? ""}
                onChange={(ev) =>
                  saveMember.mutate({ memberId: m.id, employeeId: ev.target.value || null })
                }
                aria-label="Funcionário vinculado"
                className="ml-auto h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">Sem funcionário</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={m.active}
                  onCheckedChange={(v) =>
                    saveMember.mutate({ memberId: m.id, active: !!v })
                  }
                />
                Ativo
              </label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const senha = window.prompt("Nova senha (mínimo 6 caracteres)");
                  if (senha && senha.length >= 6)
                    saveMember.mutate({ memberId: m.id, password: senha });
                }}
              >
                <KeyRound className="mr-1 size-3.5" /> Senha
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => delMember.mutate(m.id)}
                aria-label="Remover acesso"
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {MODULES.map((mod) => {
                const on = (m.modules ?? []).includes(mod.key);
                return (
                  <label key={mod.key} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={on}
                      onCheckedChange={() =>
                        saveMember.mutate({
                          memberId: m.id,
                          modules: on
                            ? (m.modules ?? []).filter((k: string) => k !== mod.key)
                            : [...(m.modules ?? []), mod.key],
                        })
                      }
                    />
                    {mod.label}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
