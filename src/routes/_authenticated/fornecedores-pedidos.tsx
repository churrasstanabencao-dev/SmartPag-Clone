import { createFileRoute } from "@tanstack/react-router";
import { FornecedoresPedidos } from "@/features/fornecedores-pedidos";

export const Route = createFileRoute("/_authenticated/fornecedores-pedidos")({
  head: () => ({
    meta: [
      { title: "Fornecedores e Pedidos — GRUPO VIPS" },
      { name: "description", content: "Fornecedores, pedidos e reposição de estoque por loja." },
      { property: "og:title", content: "Fornecedores e Pedidos — GRUPO VIPS" },
      { property: "og:description", content: "Acompanhe fornecedores e calcule o próximo pedido de cada loja." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FornecedoresPedidosPage,
});

function FornecedoresPedidosPage() {
  return (
    <div className="space-y-5 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-extrabold">Fornecedores e Pedidos</h1>
        <p className="text-sm text-muted-foreground">Calcule a reposição e acompanhe os pedidos de cada loja.</p>
      </header>
      <FornecedoresPedidos />
    </div>
  );
}
