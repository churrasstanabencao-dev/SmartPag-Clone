import { createFileRoute } from "@tanstack/react-router";
import { ContasPagar } from "@/features/contas-pagar";

export const Route = createFileRoute("/_authenticated/contas-pagar")({
  head: () => ({
    meta: [
      { title: "Contas a Pagar — GRUPO VIPS" },
      {
        name: "description",
        content:
          "Lance contas com vencimento, dê baixa nos pagamentos e acompanhe vencidas e a vencer.",
      },
      { property: "og:title", content: "Contas a Pagar — GRUPO VIPS" },
      {
        property: "og:description",
        content: "Lançamentos, vencimentos e baixa de contas com reflexo automático no BI.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContasPagarPage,
});

function ContasPagarPage() {
  return (
    <div className="space-y-5 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-extrabold">Contas a Pagar</h1>
        <p className="text-sm text-muted-foreground">
          Registre as contas de cada loja com vencimento e forma de pagamento — o BI da Rede atualiza sozinho.
        </p>
      </header>
      <ContasPagar />
    </div>
  );
}
