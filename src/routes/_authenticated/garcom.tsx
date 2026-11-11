import { createFileRoute } from "@tanstack/react-router";
import { GarcomApp } from "@/features/garcom";

export const Route = createFileRoute("/_authenticated/garcom")({
  head: () => ({
    meta: [
      { title: "Garçom — GRUPO VIPS" },
      { name: "description", content: "App do garçom para celular e maquininha: mesas, comandas e pedidos em tempo real." },
      { property: "og:title", content: "Garçom — GRUPO VIPS" },
      { property: "og:description", content: "App do garçom para celular e maquininha: mesas, comandas e pedidos em tempo real." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GarcomPage,
});

function GarcomPage() {
  return (
    <div className="space-y-5 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-extrabold">Garçom</h1>
        <p className="text-sm text-muted-foreground">
          Mesas e comandas em tempo real — pensado para celular e maquininha.
        </p>
      </header>
      <GarcomApp />
    </div>
  );
}
