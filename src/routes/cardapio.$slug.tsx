import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { UtensilsCrossed } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/cardapio/$slug")({
  head: () => ({
    meta: [
      { title: "Cardápio digital — SmartPag" },
      {
        name: "description",
        content:
          "Veja o cardápio completo do estabelecimento com preços atualizados em tempo real.",
      },
      { property: "og:title", content: "Cardápio digital" },
      {
        property: "og:description",
        content: "Cardápio online com categorias e preços atualizados.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CardapioPublico,
});

function CardapioPublico() {
  const { slug } = Route.useParams();
  const search = typeof window !== "undefined" ? window.location.search : "";
  const mesa = new URLSearchParams(search).get("mesa");

  const { data, isLoading } = useQuery({
    queryKey: ["public_menu", slug],
    queryFn: async () => {
      const { data: store, error } = await supabase
        .from("stores")
        .select("id, name, phone, address")
        .eq("menu_slug", slug)
        .maybeSingle();
      if (error) throw error;
      if (!store) return null;
      const [{ data: cats }, { data: prods }] = await Promise.all([
        supabase
          .from("categories")
          .select("id, name, sort_order")
          .eq("store_id", store.id)
          .order("sort_order"),
        supabase
          .from("products")
          .select("id, name, description, price_cents, category_id")
          .eq("store_id", store.id)
          .eq("active", true)
          .order("name"),
      ]);
      return { store, cats: cats ?? [], prods: prods ?? [] };
    },
  });

  if (isLoading) {
    return (
      <main className="mx-auto max-w-2xl p-6 text-sm text-muted-foreground">
        Carregando cardápio...
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-2xl p-10 text-center">
        <h1 className="text-xl font-black">Cardápio indisponível</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Este cardápio não existe ou não está publicado.
        </p>
      </main>
    );
  }

  const { store, cats, prods } = data;
  const semCategoria = prods.filter((p) => !p.category_id);
  const grupos = [
    ...cats.map((c) => ({ id: c.id, name: c.name, items: prods.filter((p) => p.category_id === c.id) })),
    ...(semCategoria.length ? [{ id: "outros", name: "Outros", items: semCategoria }] : []),
  ].filter((g) => g.items.length > 0);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-8 text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <UtensilsCrossed className="size-6" />
        </div>
        <h1 className="text-2xl font-black">{store.name}</h1>
        {mesa && (
          <p className="mt-1 inline-block rounded-full bg-muted px-3 py-1 text-xs font-semibold">
            Mesa {mesa}
          </p>
        )}
        {store.address && (
          <p className="mt-2 text-sm text-muted-foreground">{store.address}</p>
        )}
      </header>

      {grupos.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">
          Nenhum item disponível no momento.
        </p>
      )}

      <div className="space-y-8">
        {grupos.map((g) => (
          <section key={g.id}>
            <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-muted-foreground">
              {g.name}
            </h2>
            <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
              {g.items.map((p) => (
                <li key={p.id} className="flex items-start gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{p.name}</p>
                    {p.description && (
                      <p className="text-xs text-muted-foreground">{p.description}</p>
                    )}
                  </div>
                  <span className="ml-auto whitespace-nowrap font-bold">
                    {brl(Number(p.price_cents))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {store.phone && (
        <div className="mt-10 text-center">
          <a
            href={`https://wa.me/${store.phone.replace(/\D/g, "")}${
              mesa ? `?text=${encodeURIComponent(`Olá! Estou na mesa ${mesa}.`)}` : ""
            }`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"
          >
            Chamar o atendimento
          </a>
        </div>
      )}

      <p className="mt-10 text-center text-xs text-muted-foreground">
        Cardápio digital por SmartPag
      </p>
    </main>
  );
}
