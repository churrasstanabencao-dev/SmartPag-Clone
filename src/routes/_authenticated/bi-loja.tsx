import { createFileRoute } from "@tanstack/react-router";
import { BiLoja } from "@/features/bi-loja";

export const Route = createFileRoute("/_authenticated/bi-loja")({
  head: () => ({
    meta: [
      { title: "BI por Loja — GRUPO VIPS" },
      {
        name: "description",
        content: "Indicadores e gráficos completos filtrados por uma única loja da rede.",
      },
      { property: "og:title", content: "BI por Loja — GRUPO VIPS" },
      {
        property: "og:description",
        content: "Indicadores e gráficos completos filtrados por uma única loja da rede.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BiLojaPage,
});

function BiLojaPage() {
  return (
    <div className="space-y-5 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-extrabold">BI por Loja</h1>
        <p className="text-sm text-muted-foreground">
          Os mesmos indicadores e gráficos do BI da Rede, filtrados por uma loja escolhida.
        </p>
      </header>
      <BiLoja />
    </div>
  );
}
