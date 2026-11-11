import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  Bot,
  ShoppingCart,
  TrendingUp,
  Wallet,
  Boxes,
  BarChart3,
  Rocket,
  Send,
  Loader2,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { askAgent, type AgentId } from "@/lib/agents.functions";
import { useStore } from "@/lib/store";
import { SectionTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { WhatsAppConfig } from "@/features/whatsapp-config";
import { AgenteTransicao } from "@/features/agente-transicao";

export const Route = createFileRoute("/_authenticated/agentes")({
  component: AgentesPage,
  head: () => ({
    meta: [
      { title: "Agentes de IA | SmartPag" },
      {
        name: "description",
        content:
          "Agentes de IA especialistas em compras, vendas, financeiro, estoque e métricas conectados aos dados reais da sua loja.",
      },
      { property: "og:title", content: "Agentes de IA | SmartPag" },
      {
        property: "og:description",
        content: "Consultores de IA para compras, vendas, financeiro, estoque e relatórios da sua operação.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type AgentDef = {
  id: AgentId;
  name: string;
  role: string;
  icon: LucideIcon;
  tone: string;
  prompts: string[];
};

const AGENTS: AgentDef[] = [
  {
    id: "compras",
    name: "Agente de Compras",
    role: "Suprimentos, fornecedores e reposição",
    icon: ShoppingCart,
    tone: "bg-primary-soft text-primary",
    prompts: [
      "O que preciso comprar essa semana?",
      "Quais produtos estão com custo subindo?",
      "Monte uma sugestão de pedido para a matriz",
    ],
  },
  {
    id: "vendas",
    name: "Agente de Vendas",
    role: "Ticket médio, mix e horário de pico",
    icon: TrendingUp,
    tone: "bg-emerald-100 text-emerald-700",
    prompts: [
      "Como estão minhas vendas nos últimos 30 dias?",
      "Quais produtos mais vendem e quais encalham?",
      "Sugira ações para aumentar o ticket médio",
    ],
  },
  {
    id: "financeiro",
    name: "Agente Financeiro",
    role: "Caixa, contas a pagar e margem",
    icon: Wallet,
    tone: "bg-amber-100 text-amber-700",
    prompts: [
      "Como está a saúde do meu caixa?",
      "Quais contas devo priorizar?",
      "Existe risco de faltar caixa nos próximos dias?",
    ],
  },
  {
    id: "estoque",
    name: "Agente de Estoque",
    role: "Saldo, giro, ruptura e perdas",
    icon: Boxes,
    tone: "bg-sky-100 text-sky-700",
    prompts: [
      "Quais produtos vão faltar em breve?",
      "Tem estoque parado sem giro?",
      "Analise o consumo da cozinha",
    ],
  },
  {
    id: "relatorios",
    name: "Agente de Relatórios",
    role: "KPIs e leitura executiva",
    icon: BarChart3,
    tone: "bg-violet-100 text-violet-700",
    prompts: [
      "Me dê um resumo executivo da loja",
      "Quais são os 5 KPIs mais críticos hoje?",
      "Compare vendas, custos e resultado do mês",
    ],
  },
  {
    id: "estrategia",
    name: "Agente de Estratégia",
    role: "Expansão e controle da rede",
    icon: Rocket,
    tone: "bg-rose-100 text-rose-700",
    prompts: [
      "Qual loja está pronta para replicar o modelo?",
      "Tenho caixa para abrir uma nova unidade?",
      "Monte um plano de expansão para os próximos 6 meses",
      "Compare o desempenho das lojas da rede",
    ],
  },
];


type Msg = { role: "user" | "assistant"; content: string };

function AgentesPage() {
  const { storeId, store } = useStore();
  const [active, setActive] = useState<AgentId>("compras");
  const [threads, setThreads] = useState<Record<string, Msg[]>>({});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const ask = useServerFn(askAgent);
  const scrollRef = useRef<HTMLDivElement>(null);

  const agent = AGENTS.find((a) => a.id === active)!;
  const messages = threads[active] ?? [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    const history = [...messages, { role: "user" as const, content }];
    setThreads((t) => ({ ...t, [active]: history }));
    setInput("");
    setLoading(true);
    try {
      const res = await ask({
        data: { agent: active, storeId: storeId ?? null, messages: history },
      });
      setThreads((t) => ({
        ...t,
        [active]: [...history, { role: "assistant", content: res.text }],
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao consultar o agente.";
      toast.error(msg);
      setThreads((t) => ({ ...t, [active]: history }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionTitle icon={Bot}>Agentes de IA</SectionTitle>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="space-y-2">
          {AGENTS.map((a) => {
            const Icon = a.icon;
            const isActive = a.id === active;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setActive(a.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition",
                  isActive ? "border-primary bg-primary-soft/40" : "border-border hover:bg-muted/50",
                )}
              >
                <span className={cn("inline-flex size-9 items-center justify-center rounded-xl", a.tone)}>
                  <Icon className="size-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{a.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{a.role}</span>
                </span>
              </button>
            );
          })}
        </div>

        <Card className="flex h-[70vh] flex-col overflow-hidden p-0">
          <div className="flex items-center gap-3 border-b p-4">
            <span className={cn("inline-flex size-9 items-center justify-center rounded-xl", agent.tone)}>
              <agent.icon className="size-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{agent.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {active === "estrategia"
                  ? "Analisando todas as lojas da rede · últimos 30 dias"
                  : `Analisando dados reais de ${store?.name ?? "sua loja"} · últimos 30 dias`}
              </p>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Sparkles className="size-4" /> Pergunte algo ou use uma sugestão:
                </p>
                <div className="flex flex-wrap gap-2">
                  {agent.prompts.map((p) => (
                    <Button key={p} variant="outline" size="sm" onClick={() => send(p)}>
                      {p}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed",
                  m.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                )}
              >
                {m.content}
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> {agent.name} está analisando os dados...
              </div>
            )}
          </div>

          <div className="border-t p-3">
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                placeholder={`Pergunte ao ${agent.name}...`}
                className="max-h-32 min-h-11 resize-none"
              />
              <Button onClick={() => void send(input)} disabled={loading || !input.trim()} size="icon">
                <Send className="size-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <AgenteTransicao />

      <WhatsAppConfig />
    </div>
  );
}
