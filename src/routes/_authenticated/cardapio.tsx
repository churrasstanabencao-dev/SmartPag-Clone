import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { UtensilsCrossed } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId } from "@/lib/store";
import { brl } from "@/lib/format";
import { SectionTitle } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/cardapio")({
  head: () => ({
    meta: [
      { title: "Menu digital — SmartPag" },
      {
        name: "description",
        content:
          "Veja o cardápio digital do seu estabelecimento organizado por categorias e preços.",
      },
      { property: "og:title", content: "Menu digital — SmartPag" },
      {
        property: "og:description",
        content: "Cardápio organizado por categoria com preços atualizados.",
      },
    ],
  }),
  component: Cardapio,
});

function Cardapio() {
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*")
        .eq("store_id", currentStoreId()).order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("store_id", currentStoreId())
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const groups = [
    ...categories.map((c) => ({
      id: c.id,
      name: c.name,
      items: products.filter((p) => p.category_id === c.id),
    })),
    {
      id: "sem",
      name: "Sem categoria",
      items: products.filter((p) => !p.category_id),
    },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      <SectionTitle icon={UtensilsCrossed} tone="bg-chart-4/12 text-chart-4">
        Menu digital
      </SectionTitle>

      {groups.length === 0 ? (
        <div className="card-surface p-14 text-center text-sm text-muted-foreground">
          Cadastre produtos ativos para montar o cardápio.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map((g) => (
            <div key={g.id} className="card-surface">
              <h3 className="border-b border-border px-5 py-3 font-bold">{g.name}</h3>
              <ul className="divide-y divide-border">
                {g.items.map((p) => (
                  <li key={p.id} className="flex items-start gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{p.name}</p>
                      {p.description && (
                        <p className="text-sm text-muted-foreground">{p.description}</p>
                      )}
                    </div>
                    <span className="ml-auto whitespace-nowrap font-bold">
                      {brl(Number(p.price_cents))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
