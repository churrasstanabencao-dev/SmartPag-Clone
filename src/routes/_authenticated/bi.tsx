import { createFileRoute } from "@tanstack/react-router";
import { BiGeral } from "@/features/bi-geral";
import { BiCustosVendas } from "@/features/bi-custos-vendas";
import { BiCaixa } from "@/features/bi-caixa";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/bi")({
  head: () => ({
    meta: [
      { title: "BI da Rede — GRUPO VIPS" },
      { name: "description", content: "Visão executiva com as métricas mais importantes de todas as lojas." },
    ],
  }),
  component: BiPage,
});

function BiPage() {
  return (
    <div className="space-y-5 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-extrabold">BI da Rede</h1>
        <p className="text-sm text-muted-foreground">
          Visão única com as métricas mais importantes de todas as lojas — vendas, finanças, produtos e estoque.
        </p>
      </header>
      <Tabs defaultValue="visao-geral">
        <TabsList>
          <TabsTrigger value="visao-geral">Visão geral</TabsTrigger>
          <TabsTrigger value="custos">Custos por venda</TabsTrigger>
          <TabsTrigger value="caixa">Caixa</TabsTrigger>
        </TabsList>
        <TabsContent value="visao-geral" className="mt-5">
          <BiGeral />
        </TabsContent>
        <TabsContent value="custos" className="mt-5">
          <BiCustosVendas />
        </TabsContent>
        <TabsContent value="caixa" className="mt-5">
          <BiCaixa />
        </TabsContent>
      </Tabs>
    </div>
  );
}
