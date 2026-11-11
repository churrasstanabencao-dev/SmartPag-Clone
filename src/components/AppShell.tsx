import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  ClipboardList,
  Boxes,
  UtensilsCrossed,
  Utensils,
  Store,
  Wallet,
  Users,
  Banknote,
  Building2,
  BarChart3,
  Bot,
  ShieldCheck,
  PackagePlus,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { StoreProvider, useStore } from "@/lib/store";
import { usePermissions } from "@/lib/permissions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type NavItem = { to: string; label: string; icon: LucideIcon; key: string };

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, key: "dashboard" },
  { to: "/pdv", label: "PDV", icon: Banknote, key: "pdv" },
  { to: "/garcom", label: "Garçom", icon: Utensils, key: "garcom" },
  { to: "/cadastro", label: "Cadastro", icon: ClipboardList, key: "cadastro" },
  { to: "/estoque", label: "Estoque", icon: Boxes, key: "estoque" },
  { to: "/fornecedores-pedidos", label: "Fornecedores e Pedidos", icon: PackagePlus, key: "fornecedores-pedidos" },
  { to: "/cardapio", label: "Menu Digital", icon: UtensilsCrossed, key: "cardapio" },
  { to: "/financeiro", label: "Financeiro", icon: Wallet, key: "financeiro" },
  { to: "/contas-pagar", label: "Contas a Pagar", icon: Wallet, key: "contas_pagar" },
  { to: "/contas-receber", label: "Contas a Receber", icon: Wallet, key: "contas_receber" },
  { to: "/funcionarios", label: "Funcionário", icon: Users, key: "funcionarios" },
  { to: "/lojas", label: "Rede", icon: Building2, key: "lojas" },
  { to: "/bi", label: "BI da Rede", icon: BarChart3, key: "bi" },
  { to: "/bi-loja", label: "BI por Loja", icon: BarChart3, key: "bi_loja" },
  { to: "/estabelecimento", label: "Estabelecimento", icon: Store, key: "estabelecimento" },
  { to: "/agentes", label: "Agentes IA", icon: Bot, key: "agentes" },
  { to: "/usuarios", label: "Usuários", icon: ShieldCheck, key: "usuarios" },
];


export function IconTile({
  icon: Icon,
  tone = "bg-primary-soft text-primary",
  className,
}: {
  icon: LucideIcon;
  tone?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-xl",
        tone,
        className,
      )}
    >
      <Icon className="size-[18px]" />
    </span>
  );
}

export function SectionTitle({
  icon,
  tone,
  children,
  action,
}: {
  icon: LucideIcon;
  tone?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <IconTile icon={icon} {...(tone ? { tone } : {})} />
      <h2 className="text-xl font-bold">{children}</h2>
      {action ? <div className="ml-auto">{action}</div> : null}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <AppShellInner>{children}</AppShellInner>
    </StoreProvider>
  );
}

function StoreSwitcher() {
  const { stores, storeId, setStoreId } = useStore();
  if (stores.length <= 1) return null;
  return (
    <Select {...(storeId ? { value: storeId } : {})} onValueChange={setStoreId}>
      <SelectTrigger className="h-9 w-[220px]">
        <SelectValue placeholder="Selecionar loja" />
      </SelectTrigger>
      <SelectContent>
        {stores.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.is_matriz ? "🏢 " : "🏪 "}
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AppShellInner({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { store, storeId } = useStore();
  const { can } = usePermissions();
  const nav = NAV.filter((i) => can(i.key));
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const currentKey = pathname.split("/")[1] ?? "";
  const known = NAV.some((i) => i.key === currentKey);
  const blocked = known && !can(currentKey);


  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").maybeSingle();
      return data;
    },
  });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-[104px] shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-sidebar-border bg-sidebar py-5 md:flex">
        <div className="brand-gradient mb-5 flex size-11 items-center justify-center rounded-2xl text-lg font-black text-primary-foreground">
          S
        </div>
        {nav.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="group flex w-[84px] flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[11px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
            activeProps={{ className: "text-sidebar-primary" }}
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    "flex size-10 items-center justify-center rounded-2xl transition-colors",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground group-hover:text-sidebar-accent-foreground",
                  )}
                >
                  <item.icon className="size-[19px]" />
                </span>
                <span className="text-center leading-tight">{item.label}</span>
              </>
            )}
          </Link>
        ))}
        <button
          onClick={signOut}
          className="mt-auto flex w-[84px] flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[11px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
        >
          <span className="flex size-10 items-center justify-center rounded-2xl">
            <LogOut className="size-[19px]" />
          </span>
          Sair
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur md:px-8">
          <div className="brand-gradient flex size-9 items-center justify-center rounded-xl text-sm font-black text-primary-foreground md:hidden">
            S
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">
              {store?.name ?? profile?.store_name ?? "SmartPag"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {store?.is_matriz ? "Matriz · " : store ? "Filial · " : ""}
              {profile?.full_name || "Painel de gestão"}
            </p>
          </div>
          <div className="ml-auto">
            <StoreSwitcher />
          </div>
        </header>


        <nav className="flex gap-2 overflow-x-auto border-b border-border bg-card px-4 py-2 md:hidden">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground"
              activeProps={{ className: "bg-primary-soft text-primary" }}
            >
              {item.label}
            </Link>
          ))}
          <button
            onClick={signOut}
            className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground"
          >
            Sair
          </button>
        </nav>

        <main key={storeId ?? "none"} className="flex-1 px-4 py-6 md:px-8 md:py-8">
          {storeId ? (
            blocked ? (
              <div className="rounded-xl border border-border bg-card p-6">
                <p className="font-bold">Acesso não liberado</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Você não tem permissão para este módulo. Fale com o gestor da loja.
                </p>
              </div>
            ) : (
              children
            )
          ) : (
            <p className="text-sm text-muted-foreground">Carregando loja…</p>
          )}
        </main>

      </div>
    </div>
  );
}
