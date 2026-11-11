import { supabase } from "@/integrations/supabase/client";
import { currentStoreId } from "@/lib/store";

export const UNIDADES = [
  "UN",
  "CX",
  "FD",
  "PCT",
  "KG",
  "G",
  "L",
  "ML",
  "DZ",
  "GRF",
  "LATA",
  "PORCAO",
] as const;

export const TIPOS_PRODUTO = [
  { value: "simples", label: "Simples" },
  { value: "composto", label: "Composto (ficha técnica)" },
  { value: "combo", label: "Combo" },
  { value: "kit", label: "Kit / Balde" },
] as const;

/**
 * Expande produtos montados (combo, kit, composto) nos seus componentes,
 * somando as quantidades. Ex.: 1 Balde de cerveja = 5 UN da cerveja.
 * Percorre até 3 níveis para suportar composições encadeadas.
 */
export async function expandirComponentes(
  perProduct: Map<string, number>,
): Promise<Map<string, number>> {
  let atual = new Map(perProduct);

  for (let nivel = 0; nivel < 3; nivel++) {
    const ids = [...atual.keys()];
    if (ids.length === 0) break;
    const { data, error } = await supabase
      .from("product_components")
      .select("parent_product_id, component_product_id, quantity")
      .in("parent_product_id", ids);
    if (error) throw error;
    if (!data || data.length === 0) break;

    const proximo = new Map<string, number>();
    let mudou = false;
    for (const [id, qty] of atual) {
      const comps = data.filter((c) => c.parent_product_id === id);
      if (comps.length === 0) {
        proximo.set(id, (proximo.get(id) ?? 0) + qty);
        continue;
      }
      mudou = true;
      for (const c of comps) {
        const q = qty * Number(c.quantity);
        proximo.set(
          c.component_product_id,
          (proximo.get(c.component_product_id) ?? 0) + q,
        );
      }
    }
    atual = proximo;
    if (!mudou) break;
  }

  return atual;
}

/**
 * Faz a baixa de estoque de um pedido considerando produtos montados.
 * Retorna o saldo final de cada produto movimentado.
 */
export async function baixarEstoqueDoPedido(opts: {
  items: { product_id: string | null; quantity: number | string }[];
  tabId: string;
  userId: string;
  reason?: string;
}): Promise<{ name: string; qty: number }[]> {
  const perProduct = new Map<string, number>();
  for (const i of opts.items) {
    if (!i.product_id) continue;
    perProduct.set(
      i.product_id,
      (perProduct.get(i.product_id) ?? 0) + Number(i.quantity),
    );
  }
  if (perProduct.size === 0) return [];

  const expandido = await expandirComponentes(perProduct);
  const ids = [...expandido.keys()];
  if (ids.length === 0) return [];

  const { data: prods, error } = await supabase
    .from("products")
    .select("id, name, track_stock, stock_qty")
    .in("id", ids);
  if (error) throw error;

  const resultado: { name: string; qty: number }[] = [];
  for (const [productId, qty] of expandido) {
    const p = prods?.find((x) => x.id === productId);
    if (!p || !p.track_stock || qty <= 0) continue;
    const novo = Number(p.stock_qty) - qty;
    const { error: mvErr } = await supabase.from("stock_movements").insert({
      user_id: opts.userId,
      store_id: currentStoreId(),
      product_id: productId,
      quantity: -qty,
      reason: opts.reason ?? "venda",
      tab_id: opts.tabId,
    });
    if (mvErr) throw mvErr;
    const { error: upErr } = await supabase
      .from("products")
      .update({ stock_qty: novo })
      .eq("id", productId);
    if (upErr) throw upErr;
    resultado.push({ name: p.name, qty: novo });
  }
  return resultado;
}
