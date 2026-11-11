import { createFileRoute } from "@tanstack/react-router";
import { ContasReceber } from "@/features/contas-receber";

export const Route = createFileRoute("/_authenticated/contas-receber")({
  head: () => ({
    meta: [
      { title: "Contas a Receber — GRUPO VIPS" },
      { name: "description", content: "Lançamentos e recebimentos de cada loja com atualização automática do BI." },
      { property: "og:title", content: "Contas a Receber — GRUPO VIPS" },
      { property: "og:description", content: "Acompanhe valores em aberto, vencidos e recebidos por loja." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContasReceberPage,
});

function ContasReceberPage() {
  return (
    <div className="space-y-5 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-extrabold">Contas a Receber</h1>
        <p className="text-sm text-muted-foreground">Registre e acompanhe os recebimentos de cada loja.</p>
      </header>
      <ContasReceber />
    </div>
  );
}
