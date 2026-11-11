import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2,
  Plus,
  Store as StoreIcon,
  Users,
  BarChart3,
  Receipt,
  Trash2,
  Percent,
} from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { brl, shortDate } from "@/lib/format";
import { useStore } from "@/lib/store";
import { BiRede } from "@/features/bi-rede";
import { SectionTitle } from "@/components/AppShell";
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
import {
  addStoreMember,
  listStoreMembers,
  removeStoreMember,
} from "@/lib/network.functions";
import { VendasPorLojaModule } from "@/features/vendas-por-loja";
import { ComissoesModule } from "@/features/comissoes";

export const Route = createFileRoute("/_authenticated/lojas")({
  head: () => ({
    meta: [
      { title: "Rede de lojas — SmartPag" },
      {
        name: "description",
        content:
          "Cadastre filiais, conceda acessos e acompanhe o desempenho consolidado de toda a rede.",
      },
      { property: "og:title", content: "Rede de lojas — SmartPag" },
      {
        property: "og:description",
        content: "Matriz com visão consolidada de vendas, compras e estoque das filiais.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LojasPage,
});

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n: number) =>
  new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

function Card({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function LojasPage() {
  const { stores, matriz, networkStores, storeId, setStoreId, isMatriz } = useStore();
  const [tab, setTab] = useState<
    "lojas" | "acessos" | "rede" | "bi" | "vendas" | "comissoes"
  >("lojas");

  const canManageNetwork = !!matriz;

  return (
    <div className="space-y-6">
      <SectionTitle icon={Building2} tone="bg-primary-soft text-primary">
        Rede de lojas
      </SectionTitle>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["lojas", "Lojas da rede", StoreIcon],
            ["acessos", "Acessos", Users],
            ["rede", "Visão consolidada", BarChart3],
            ["bi", "BI & Relatórios", BarChart3],
            ...(isMatriz
              ? ([
                  ["vendas", "Vendas por loja", Receipt],
                  ["comissoes", "Comissões", Percent],
                ] as const)
              : ([] as const)),
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              tab === key
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "lojas" ? (
        <LojasTab
          stores={stores}
          matriz={matriz}
          storeId={storeId}
          setStoreId={setStoreId}
          canManageNetwork={canManageNetwork}
        />
      ) : null}
      {tab === "acessos" ? <AcessosTab /> : null}
      {tab === "bi" ? <BiRede /> : null}
      {tab === "rede" ? (
        <RedeTab stores={networkStores} isMatriz={isMatriz} />
      ) : null}
      {tab === "vendas" ? <VendasPorLojaModule /> : null}
      {tab === "comissoes" ? <ComissoesModule /> : null}
    </div>
  );
}

/* ---------------- Lojas ---------------- */

function LojasTab({
  stores,
  matriz,
  storeId,
  setStoreId,
  canManageNetwork,
}: {
  stores: ReturnType<typeof useStore>["stores"];
  matriz: ReturnType<typeof useStore>["matriz"];
  storeId: string | null;
  setStoreId: (id: string) => void;
  canManageNetwork: boolean;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Informe o nome da filial");
      if (!matriz) throw new Error("Matriz não encontrada");
      const { data: auth } = await supabase.auth.getUser();
      const { data: created, error } = await supabase
        .from("stores")
        .insert({
          owner_id: auth.user!.id,
          parent_id: matriz.id,
          name: name.trim(),
          code: code.trim() || null,
          phone: phone.trim() || null,
          address: address.trim() || null,
          is_matriz: false,
        })
        .select()
        .single();
      if (error) throw error;
      const { error: memErr } = await supabase
        .from("store_members")
        .insert({ store_id: created.id, user_id: auth.user!.id, role: "owner" });
      if (memErr) throw memErr;
      return created;
    },
    onSuccess: () => {
      toast.success("Filial cadastrada");
      setName("");
      setCode("");
      setPhone("");
      setAddress("");
      qc.invalidateQueries({ queryKey: ["stores"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("stores").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stores"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border p-4">
          <p className="text-sm font-bold">Lojas cadastradas ({stores.length})</p>
          <p className="text-xs text-muted-foreground">
            Selecione uma loja para operar dentro dela (comandas, caixa, compras,
            estoque e preços).
          </p>
        </div>
        <div className="divide-y divide-border">
          {stores.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {s.is_matriz ? "🏢" : "🏪"} {s.name}
                  {s.code ? (
                    <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {s.code}
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {s.is_matriz ? "Matriz" : "Filial"} · desde {shortDate(s.created_at)}
                  {s.phone ? ` · ${s.phone}` : ""}
                  {!s.active ? " · inativa" : ""}
                </p>
              </div>
              {storeId === s.id ? (
                <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
                  Operando
                </span>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setStoreId(s.id)}>
                  Entrar na loja
                </Button>
              )}
              {!s.is_matriz ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => toggleActive.mutate({ id: s.id, active: !s.active })}
                >
                  {s.active ? "Desativar" : "Ativar"}
                </Button>
              ) : null}
            </div>
          ))}
          {stores.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Nenhuma loja ainda.</p>
          ) : null}
        </div>
      </div>

      <div className="h-fit rounded-2xl border border-border bg-card p-4">
        <p className="mb-3 text-sm font-bold">Nova filial</p>
        {!canManageNetwork ? (
          <p className="text-xs text-muted-foreground">
            Somente a matriz pode cadastrar filiais.
          </p>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Loja Centro" />
            </div>
            <div>
              <Label>Código</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="F01" />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <Label>Endereço</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <Button
              className="w-full"
              onClick={() => create.mutate()}
              disabled={create.isPending}
            >
              <Plus className="mr-1 size-4" /> Cadastrar filial
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Acessos ---------------- */

function AcessosTab() {
  const { stores, storeId } = useStore();
  const [target, setTarget] = useState<string | null>(storeId);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("staff");
  const [password, setPassword] = useState("");
  const qc = useQueryClient();

  const list = useServerFn(listStoreMembers);
  const add = useServerFn(addStoreMember);
  const remove = useServerFn(removeStoreMember);
  const activeStore = target ?? storeId;

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["store_members", activeStore],
    enabled: !!activeStore,
    queryFn: () => list({ data: { storeId: activeStore! } }),
  });

  const invite = useMutation({
    mutationFn: async () =>
      add({
        data: {
          storeId: activeStore!,
          email: email.trim(),
          role: role as "owner" | "manager" | "staff",
          ...(password.trim() ? { password: password.trim() } : {}),
        },
      }),
    onSuccess: () => {
      toast.success("Acesso concedido");
      setEmail("");
      setPassword("");
      qc.invalidateQueries({ queryKey: ["store_members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (memberId: string) => remove({ data: { memberId } }),
    onSuccess: () => {
      toast.success("Acesso removido");
      qc.invalidateQueries({ queryKey: ["store_members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <p className="text-sm font-bold">Usuários com acesso</p>
          <div className="ml-auto w-[220px]">
            <Select {...(activeStore ? { value: activeStore } : {})} onValueChange={setTarget}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Loja" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="divide-y divide-border">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Carregando…</p>
          ) : null}
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.email}</p>
                <p className="text-xs text-muted-foreground">
                  {m.role === "owner"
                    ? "Dono"
                    : m.role === "manager"
                      ? "Gerente"
                      : "Operador"}{" "}
                  · desde {shortDate(m.created_at)}
                </p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => del.mutate(m.id)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          {!isLoading && members.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Nenhum acesso ainda.</p>
          ) : null}
        </div>
      </div>

      <div className="h-fit rounded-2xl border border-border bg-card p-4">
        <p className="mb-3 text-sm font-bold">Conceder acesso</p>
        <div className="space-y-3">
          <div>
            <Label>E-mail</Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="gerente@loja.com"
            />
          </div>
          <div>
            <Label>Papel</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manager">Gerente</SelectItem>
                <SelectItem value="staff">Operador</SelectItem>
                <SelectItem value="owner">Dono</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Senha inicial (se novo usuário)</Label>
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="mín. 6 caracteres"
            />
          </div>
          <Button
            className="w-full"
            disabled={!activeStore || invite.isPending}
            onClick={() => invite.mutate()}
          >
            <Plus className="mr-1 size-4" /> Conceder acesso
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Visão consolidada ---------------- */

function RedeTab({
  stores,
  isMatriz,
}: {
  stores: ReturnType<typeof useStore>["networkStores"];
  isMatriz: boolean;
}) {
  const [from, setFrom] = useState(daysAgoISO(30));
  const [to, setTo] = useState(todayISO());
  const [bucket, setBucket] = useState<"dia" | "semana">("dia");
  const ids = useMemo(() => stores.map((s) => s.id), [stores]);

  const { data } = useQuery({
    queryKey: ["network-report", ids.join(","), from, to],
    enabled: ids.length > 0,
    refetchInterval: 30000,
    queryFn: async () => {
      const start = `${from}T00:00:00`;
      const end = `${to}T23:59:59`;

      const [pay, tabsRes, purch, prods, exp] = await Promise.all([
        supabase
          .from("payments")
          .select("store_id, amount_cents, method, paid_at")
          .in("store_id", ids)
          .gte("paid_at", start)
          .lte("paid_at", end),
        supabase
          .from("tabs")
          .select("store_id, id, status, closed_at, opened_at")
          .in("store_id", ids)
          .gte("opened_at", start)
          .lte("opened_at", end),
        supabase
          .from("purchases")
          .select("store_id, total_cents, issued_at, status")
          .in("store_id", ids)
          .gte("issued_at", from)
          .lte("issued_at", to),
        supabase
          .from("products")
          .select("store_id, stock_qty, cost_cents, track_stock, min_stock")
          .in("store_id", ids),
        supabase
          .from("expenses")
          .select("store_id, amount_cents, due_date, paid")
          .in("store_id", ids)
          .gte("due_date", from)
          .lte("due_date", to),
      ]);

      const rows = stores.map((s) => {
        const vendas = (pay.data ?? [])
          .filter((p) => p.store_id === s.id)
          .reduce((a, p) => a + Number(p.amount_cents), 0);
        const comandas = (tabsRes.data ?? []).filter((t) => t.store_id === s.id).length;
        const compras = (purch.data ?? [])
          .filter((p) => p.store_id === s.id && p.status === "confirmed")
          .reduce((a, p) => a + Number(p.total_cents), 0);
        const despesas = (exp.data ?? [])
          .filter((e) => e.store_id === s.id)
          .reduce((a, e) => a + Number(e.amount_cents), 0);
        const estoque = (prods.data ?? [])
          .filter((p) => p.store_id === s.id)
          .reduce((a, p) => a + Number(p.stock_qty) * Number(p.cost_cents), 0);
        const alertas = (prods.data ?? []).filter(
          (p) =>
            p.store_id === s.id &&
            p.track_stock &&
            Number(p.stock_qty) <= Number(p.min_stock),
        ).length;
        return {
          id: s.id,
          name: s.name,
          is_matriz: s.is_matriz,
          vendas,
          comandas,
          compras,
          despesas,
          estoque,
          alertas,
          ticket: comandas > 0 ? Math.round(vendas / comandas) : 0,
          resultado: vendas - compras - despesas,
        };
      });

      return {
        rows,
        payments: (pay.data ?? []).map((p) => ({
          store_id: p.store_id as string,
          amount_cents: Number(p.amount_cents),
          paid_at: p.paid_at as string,
        })),
        tabs: (tabsRes.data ?? []).map((t) => ({
          store_id: t.store_id as string,
          opened_at: t.opened_at as string,
        })),
      };
    },
  });

  const rows = data?.rows ?? [];
  const total = rows.reduce(
    (a, r) => ({
      vendas: a.vendas + r.vendas,
      compras: a.compras + r.compras,
      despesas: a.despesas + r.despesas,
      estoque: a.estoque + r.estoque,
      comandas: a.comandas + r.comandas,
    }),
    { vendas: 0, compras: 0, despesas: 0, estoque: 0, comandas: 0 },
  );

  const series = useMemo(() => {
    const payments = data?.payments ?? [];
    const tabsList = data?.tabs ?? [];
    const nameById = new Map(rows.map((r) => [r.id, r.name] as const));
    const keys = new Set<string>();
    const acc = new Map<
      string,
      Map<string, { vendas: number; comandas: number }>
    >();

    const touch = (key: string, store: string) => {
      keys.add(key);
      if (!acc.has(key)) acc.set(key, new Map());
      const per = acc.get(key)!;
      if (!per.has(store)) per.set(store, { vendas: 0, comandas: 0 });
      return per.get(store)!;
    };

    for (const p of payments) {
      const name = nameById.get(p.store_id);
      if (!name) continue;
      touch(bucketKey(p.paid_at, bucket), name).vendas += p.amount_cents;
    }
    for (const t of tabsList) {
      const name = nameById.get(t.store_id);
      if (!name) continue;
      touch(bucketKey(t.opened_at, bucket), name).comandas += 1;
    }

    const sorted = [...keys].sort();
    const build = (metric: "vendas" | "comandas" | "ticket") =>
      sorted.map((key) => {
        const per = acc.get(key)!;
        const point: Record<string, string | number> = {
          label: bucketLabel(key, bucket),
        };
        let vendas = 0;
        let comandas = 0;
        for (const r of rows) {
          const v = per.get(r.name) ?? { vendas: 0, comandas: 0 };
          vendas += v.vendas;
          comandas += v.comandas;
          point[r.name] =
            metric === "vendas"
              ? v.vendas / 100
              : metric === "comandas"
                ? v.comandas
                : v.comandas > 0
                  ? Math.round(v.vendas / v.comandas) / 100
                  : 0;
        }
        point["Rede"] =
          metric === "vendas"
            ? vendas / 100
            : metric === "comandas"
              ? comandas
              : comandas > 0
                ? Math.round(vendas / comandas) / 100
                : 0;
        return point;
      });

    return {
      vendas: build("vendas"),
      comandas: build("comandas"),
      ticket: build("ticket"),
    };
  }, [data, rows, bucket]);

  const empty = series.vendas.length === 0;

  return (
    <div className="space-y-5">
      {!isMatriz ? (
        <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Você está operando em uma filial. Troque para a matriz no seletor do topo para
          ver a rede completa.
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label>De</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label>Até</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <Label>Agrupar por</Label>
          <div className="flex gap-2">
            {(["dia", "semana"] as const).map((b) => (
              <button
                key={b}
                onClick={() => setBucket(b)}
                className={`rounded-full px-4 py-2 text-sm font-medium capitalize transition-colors ${
                  bucket === b
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:bg-muted"
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Card label="Vendas da rede" value={brl(total.vendas)} hint={`${rows.length} lojas`} />
        <Card label="Comandas" value={String(total.comandas)} />
        <Card
          label="Ticket médio da rede"
          value={brl(total.comandas > 0 ? Math.round(total.vendas / total.comandas) : 0)}
        />
        <Card label="Compras" value={brl(total.compras)} />
        <Card label="Estoque a custo" value={brl(total.estoque)} />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="mb-3 text-sm font-bold">Vendas por loja (total do período)</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows.map((r) => ({ name: r.name, vendas: r.vendas / 100 }))}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip
                formatter={(v: number) => brl(Math.round(v * 100))}
                labelStyle={{ fontWeight: 600 }}
              />
              <Bar dataKey="vendas" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <TrendChart
          title={`Vendas por ${bucket}`}
          data={series.vendas}
          stores={rows.map((r) => r.name)}
          money
          empty={empty}
        />
        <TrendChart
          title={`Ticket médio por ${bucket}`}
          data={series.ticket}
          stores={rows.map((r) => r.name)}
          money
          empty={empty}
        />
      </div>

      <ComandasChart
        title={`Comandas por ${bucket}`}
        data={series.comandas}
        stores={rows.map((r) => r.name)}
        empty={empty}
      />

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="p-3 text-left font-medium">Loja</th>
              <th className="p-3 text-right font-medium">Vendas</th>
              <th className="p-3 text-right font-medium">Comandas</th>
              <th className="p-3 text-right font-medium">Ticket médio</th>
              <th className="p-3 text-right font-medium">Compras</th>
              <th className="p-3 text-right font-medium">Despesas</th>
              <th className="p-3 text-right font-medium">Estoque</th>
              <th className="p-3 text-right font-medium">Alertas</th>
              <th className="p-3 text-right font-medium">Resultado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="p-3 font-medium">
                  {r.is_matriz ? "🏢" : "🏪"} {r.name}
                </td>
                <td className="p-3 text-right">{brl(r.vendas)}</td>
                <td className="p-3 text-right">{r.comandas}</td>
                <td className="p-3 text-right">{brl(r.ticket)}</td>
                <td className="p-3 text-right">{brl(r.compras)}</td>
                <td className="p-3 text-right">{brl(r.despesas)}</td>
                <td className="p-3 text-right">{brl(r.estoque)}</td>
                <td className="p-3 text-right">{r.alertas}</td>
                <td
                  className={`p-3 text-right font-semibold ${
                    r.resultado >= 0 ? "text-emerald-600" : "text-destructive"
                  }`}
                >
                  {brl(r.resultado)}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="p-6 text-sm text-muted-foreground" colSpan={9}>
                  Sem dados no período.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Gráficos comparativos ---------------- */

const SERIES_COLORS = [
  "hsl(var(--primary))",
  "#f97316",
  "#10b981",
  "#8b5cf6",
  "#ef4444",
  "#0ea5e9",
  "#eab308",
];

function bucketKey(iso: string, mode: "dia" | "semana") {
  const d = new Date(iso);
  if (mode === "dia") return d.toISOString().slice(0, 10);
  const monday = new Date(d);
  const day = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - day);
  return monday.toISOString().slice(0, 10);
}

function bucketLabel(key: string, mode: "dia" | "semana") {
  return mode === "dia" ? shortDate(key) : `sem. ${shortDate(key)}`;
}

function ChartShell({
  title,
  empty,
  children,
}: {
  title: string;
  empty: boolean;
  children: React.ReactElement;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="mb-3 text-sm font-bold">{title}</p>
      {empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Sem dados no período.
        </p>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function TrendChart({
  title,
  data,
  stores,
  money,
  empty,
}: {
  title: string;
  data: Record<string, string | number>[];
  stores: string[];
  money?: boolean;
  empty: boolean;
}) {
  return (
    <ChartShell title={title} empty={empty}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" fontSize={12} />
        <YAxis fontSize={12} />
        <Tooltip
          formatter={(v: number) => (money ? brl(Math.round(v * 100)) : String(v))}
          labelStyle={{ fontWeight: 600 }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="Rede"
          stroke="#0f172a"
          strokeWidth={3}
          dot={false}
        />
        {stores.map((name, i) => (
          <Line
            key={name}
            type="monotone"
            dataKey={name}
            stroke={SERIES_COLORS[i % SERIES_COLORS.length] as string}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ChartShell>
  );
}

function ComandasChart({
  title,
  data,
  stores,
  empty,
}: {
  title: string;
  data: Record<string, string | number>[];
  stores: string[];
  empty: boolean;
}) {
  return (
    <ChartShell title={title} empty={empty}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" fontSize={12} />
        <YAxis fontSize={12} allowDecimals={false} />
        <Tooltip labelStyle={{ fontWeight: 600 }} />
        <Legend />
        {stores.map((name, i) => (
          <Bar
            key={name}
            dataKey={name}
            stackId="c"
            fill={SERIES_COLORS[i % SERIES_COLORS.length] as string}
            radius={[4, 4, 0, 0]}
          />
        ))}
      </BarChart>
    </ChartShell>
  );
}
