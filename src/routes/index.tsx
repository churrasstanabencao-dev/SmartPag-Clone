import { createFileRoute, Link } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Receipt,
  Boxes,
  Wallet,
  BarChart3,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTile } from "@/components/AppShell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SmartPag — Sistema de gestão para bares e restaurantes" },
      {
        name: "description",
        content:
          "Controle caixa, comandas, estoque, cardápio, funcionários e pagamentos do seu restaurante em um só painel.",
      },
      { property: "og:title", content: "SmartPag — Gestão para restaurantes" },
      {
        property: "og:description",
        content:
          "Caixa, comandas, estoque, financeiro e relatórios em um painel simples e rápido.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: LayoutDashboard,
    tone: "bg-chart-1/12 text-chart-1",
    title: "Movimentação do caixa",
    text: "Faturamento do dia, ticket médio e pagamentos por forma em tempo real.",
  },
  {
    icon: Receipt,
    tone: "bg-chart-5/12 text-chart-5",
    title: "Comandas e mesas",
    text: "Abra, lance itens e feche comandas de mesa, balcão ou delivery.",
  },
  {
    icon: Boxes,
    tone: "bg-chart-2/12 text-chart-2",
    title: "Estoque",
    text: "Entradas, saídas e alerta de estoque mínimo por produto.",
  },
  {
    icon: Wallet,
    tone: "bg-chart-3/15 text-chart-3",
    title: "Financeiro",
    text: "Despesas, contas a pagar e resultado do período.",
  },
  {
    icon: BarChart3,
    tone: "bg-chart-4/12 text-chart-4",
    title: "Relatórios",
    text: "Vendas por dia, por forma de pagamento e produtos mais vendidos.",
  },
  {
    icon: Users,
    tone: "bg-chart-6/15 text-chart-6",
    title: "Funcionários",
    text: "Equipe cadastrada com cargo e PIN de acesso ao caixa.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6">
        <div className="flex items-center gap-3">
          <span className="brand-gradient flex size-10 items-center justify-center rounded-2xl text-base font-black text-primary-foreground">
            S
          </span>
          <span className="text-xl font-black tracking-tight">SmartPag</span>
        </div>
        <Button asChild size="sm">
          <Link to="/auth">Entrar</Link>
        </Button>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-10 text-center md:pt-20">
        <span className="inline-flex rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-accent-foreground">
          Gestão completa para o seu salão
        </span>
        <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-black leading-[1.05] tracking-tight md:text-6xl">
          Todo o seu restaurante em um painel só
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground md:text-lg">
          Caixa, comandas, cardápio, estoque, financeiro e relatórios. Simples de usar
          no balcão e completo o suficiente para a gestão.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/auth">Começar agora</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/auth">Já tenho conta</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-24">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card-surface p-5">
              <IconTile icon={f.icon} tone={f.tone} />
              <h2 className="mt-4 text-base font-bold">{f.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        SmartPag · Gestão para bares e restaurantes
      </footer>
    </div>
  );
}
