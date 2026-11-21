import { createServerFn } from "@tanstack/react-start";
import { generateAiText } from "@/lib/ai.server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const AGENT_IDS = [
  "compras",
  "vendas",
  "financeiro",
  "estoque",
  "relatorios",
  "estrategia",
] as const;
export type AgentId = (typeof AGENT_IDS)[number];

const SYSTEM: Record<AgentId, string> = {
  compras:
    "Você é o Agente de Compras da rede (ERP de restaurante SmartPag). Especialista em suprimentos, negociação com fornecedores, custo médio, ponto de pedido e reposição. Sugira o que comprar, em que quantidade e por quê, sempre com números do contexto.",
  vendas:
    "Você é o Agente de Vendas. Especialista em performance de comandas/mesas, ticket médio, mix de produtos, horário de pico e ações práticas para aumentar faturamento.",
  financeiro:
    "Você é o Agente Financeiro. Especialista em caixa, fluxo de entradas e saídas, contas a pagar, margem e saúde financeira. Aponte riscos de caixa e prioridades de pagamento.",
  estoque:
    "Você é o Agente de Estoque. Especialista em saldo, giro, ruptura, produtos abaixo do mínimo, perdas e consumo da cozinha. Aponte rupturas iminentes e excessos parados.",
  relatorios:
    "Você é o Agente de Relatórios e Métricas. Especialista em KPIs consolidados, comparativos e leitura executiva dos números da loja/rede. Entregue análises objetivas com indicadores.",
  estrategia:
    "Você é o Agente de Desenvolvimento e Estratégia de Negócios da rede. Especialista em expansão (novas unidades, praças, franquias), padronização e controle da rede, benchmark entre lojas, margem por unidade, viabilidade de abertura, metas e plano de crescimento. Compare o desempenho das lojas, identifique unidades modelo e unidades com problema, estime capacidade de investimento a partir do caixa e do resultado, e proponha um plano de expansão com etapas e indicadores de acompanhamento.",
};

const BASE_RULES = `Responda SEMPRE em português do Brasil, de forma objetiva e executiva.
Use os DADOS REAIS fornecidos no contexto; nunca invente números.
Formate valores em R$ (os campos *_cents estão em centavos).
Estruture a resposta em tópicos curtos e finalize com "Ações recomendadas" (2 a 4 itens).
Se faltar dado para concluir algo, diga claramente o que falta.`;

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Sb = { from: (t: string) => any };

async function buildContext(supabase: Sb, agent: AgentId, storeId: string | null) {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const scope = <T,>(q: T): T =>
    storeId ? (q as any).eq("store_id", storeId) : (q as any);

  const parts: string[] = [];

  if (agent === "estrategia") {
    const st = await supabase
      .from("stores")
      .select("id,name,code,is_matriz,active,address")
      .limit(100);
    const stores: any[] = st.data ?? [];
    const nameOf = new Map(stores.map((s) => [s.id, s.name]));
    parts.push(
      `LOJAS DA REDE (${stores.length}):\n` +
        (stores
          .map(
            (s) =>
              `${s.name}${s.code ? ` (${s.code})` : ""} | ${s.is_matriz ? "MATRIZ" : "filial"} | ${s.active ? "ativa" : "inativa"}${s.address ? ` | ${s.address}` : ""} | id=${s.id}`,
          )
          .join("\n") || "sem lojas"),
    );

    const pay = await supabase
      .from("payments")
      .select("amount_cents,store_id,paid_at")
      .gte("paid_at", since)
      .limit(5000);
    const byStore = ((pay.data ?? []) as any[]).reduce<Record<string, { n: number; v: number }>>(
      (acc, p) => {
        const cur = acc[p.store_id] ?? { n: 0, v: 0 };
        cur.n += 1;
        cur.v += p.amount_cents;
        acc[p.store_id] = cur;
        return acc;
      },
      {},
    );
    parts.push(
      `VENDAS 30d POR LOJA:\n` +
        (Object.entries(byStore)
          .sort((a, b) => b[1].v - a[1].v)
          .map(
            ([id, v]) =>
              `${nameOf.get(id) ?? id} | ${brl(v.v)} | ${v.n} pagamentos | ticket médio ${brl(Math.round(v.v / v.n))} | média diária ${brl(Math.round(v.v / 30))}`,
          )
          .join("\n") || "sem vendas"),
    );

    const tr = await supabase
      .from("transfers")
      .select("doc_number,from_store_id,to_store_id,total_cents,status,payment_status,issued_at")
      .gte("issued_at", since.slice(0, 10))
      .order("issued_at", { ascending: false })
      .limit(100);
    const trs: any[] = tr.data ?? [];
    parts.push(
      `TRANSFERÊNCIAS/VENDAS INTERNAS 30d (${trs.length}) total ${brl(trs.reduce((s, t) => s + (t.total_cents ?? 0), 0))}:\n` +
        (trs
          .slice(0, 30)
          .map(
            (t) =>
              `${t.issued_at} | ${t.doc_number ?? "-"} | ${nameOf.get(t.from_store_id) ?? "?"} -> ${nameOf.get(t.to_store_id) ?? "?"} | ${brl(t.total_cents)} | ${t.status}/${t.payment_status}`,
          )
          .join("\n") || "sem transferências"),
    );

    const exp = await supabase
      .from("expenses")
      .select("store_id,amount_cents,paid,due_date,category")
      .limit(500);
    const expByStore = ((exp.data ?? []) as any[]).reduce<Record<string, { open: number; paid: number }>>(
      (acc, e) => {
        const cur = acc[e.store_id] ?? { open: 0, paid: 0 };
        if (e.paid) cur.paid += e.amount_cents;
        else cur.open += e.amount_cents;
        acc[e.store_id] = cur;
        return acc;
      },
      {},
    );
    parts.push(
      `DESPESAS POR LOJA (em aberto / pagas):\n` +
        (Object.entries(expByStore)
          .map(([id, v]) => `${nameOf.get(id) ?? id} | aberto ${brl(v.open)} | pago ${brl(v.paid)}`)
          .join("\n") || "sem despesas"),
    );

    const pr = await supabase
      .from("products")
      .select("store_id,stock_qty,cost_cents,active")
      .eq("active", true)
      .limit(2000);
    const stockByStore = ((pr.data ?? []) as any[]).reduce<Record<string, { skus: number; val: number }>>(
      (acc, p) => {
        const cur = acc[p.store_id] ?? { skus: 0, val: 0 };
        cur.skus += 1;
        cur.val += (p.stock_qty ?? 0) * (p.cost_cents ?? 0);
        acc[p.store_id] = cur;
        return acc;
      },
      {},
    );
    parts.push(
      `ESTOQUE (valor a custo) POR LOJA:\n` +
        (Object.entries(stockByStore)
          .map(([id, v]) => `${nameOf.get(id) ?? id} | ${v.skus} SKUs ativos | ${brl(Math.round(v.val))}`)
          .join("\n") || "sem estoque"),
    );

    return parts.join("\n\n");
  }

  const products = await scope(
    supabase
      .from("products")
      .select("name,sku,stock_qty,min_stock,cost_cents,price_cents,wholesale_price_cents,active")
      .eq("active", true)
      .order("stock_qty", { ascending: true })
      .limit(120),
  );
  const prods: any[] = products.data ?? [];

  if (agent === "compras" || agent === "estoque" || agent === "relatorios") {
    const abaixo = prods.filter((p) => p.stock_qty <= p.min_stock);
    parts.push(
      `PRODUTOS (${prods.length}): ` +
        prods
          .slice(0, 60)
          .map(
            (p) =>
              `${p.name} | saldo ${p.stock_qty} | mín ${p.min_stock} | custo ${brl(p.cost_cents)} | venda ${brl(p.price_cents)}`,
          )
          .join("\n"),
    );
    parts.push(
      `ABAIXO DO MÍNIMO (${abaixo.length}): ` +
        (abaixo.map((p) => `${p.name} (${p.stock_qty}/${p.min_stock})`).join(", ") || "nenhum"),
    );
    const mov = await scope(
      supabase
        .from("stock_movements")
        .select("quantity,reason,created_at,product_id")
        .gte("created_at", since)
        .limit(500),
    );
    const movs: any[] = mov.data ?? [];
    const entradas = movs.filter((m) => m.quantity > 0).reduce((s, m) => s + m.quantity, 0);
    const saidas = movs.filter((m) => m.quantity < 0).reduce((s, m) => s + m.quantity, 0);
    parts.push(
      `MOVIMENTAÇÕES 30d: ${movs.length} lançamentos | entradas ${entradas} un | saídas ${Math.abs(saidas)} un`,
    );
    const byProduct = movs.reduce<Record<string, { in: number; out: number }>>((acc, m) => {
      const cur = acc[m.product_id] ?? { in: 0, out: 0 };
      if (m.quantity > 0) cur.in += m.quantity;
      else cur.out += Math.abs(m.quantity);
      acc[m.product_id] = cur;
      return acc;
    }, {});
    const names = await scope(
      supabase.from("products").select("id,name").limit(200),
    );
    const nameById = new Map(((names.data ?? []) as any[]).map((p) => [p.id, p.name]));
    parts.push(
      `CONSUMO POR PRODUTO 30d (média diária de saída):\n` +
        (Object.entries(byProduct)
          .sort((a, b) => b[1].out - a[1].out)
          .slice(0, 40)
          .map(
            ([id, v]) =>
              `${nameById.get(id) ?? id} | saídas ${v.out} un (${(v.out / 30).toFixed(1)}/dia) | entradas ${v.in} un`,
          )
          .join("\n") || "sem movimentações"),
    );
  }

  if (agent === "compras" || agent === "financeiro" || agent === "relatorios") {
    const pur = await scope(
      supabase
        .from("purchases")
        .select("supplier,total_cents,status,issued_at,invoice_number")
        .gte("issued_at", since.slice(0, 10))
        .order("issued_at", { ascending: false })
        .limit(50),
    );
    const list: any[] = pur.data ?? [];
    parts.push(
      `COMPRAS 30d (${list.length}) total ${brl(list.reduce((s, p) => s + (p.total_cents ?? 0), 0))}:\n` +
        list
          .slice(0, 25)
          .map((p) => `${p.issued_at} | ${p.supplier} | ${brl(p.total_cents)} | ${p.status}`)
          .join("\n"),
    );
  }

  if (agent === "vendas" || agent === "relatorios" || agent === "financeiro") {
    const pay = await scope(
      supabase.from("payments").select("amount_cents,method,paid_at").gte("paid_at", since).limit(1000),
    );
    const pays: any[] = pay.data ?? [];
    const total = pays.reduce((s, p) => s + p.amount_cents, 0);
    const byMethod = pays.reduce<Record<string, number>>((acc, p) => {
      acc[p.method] = (acc[p.method] ?? 0) + p.amount_cents;
      return acc;
    }, {});
    const byHour = pays.reduce<Record<string, number>>((acc, p) => {
      const h = new Date(p.paid_at).getHours().toString().padStart(2, "0");
      acc[h] = (acc[h] ?? 0) + p.amount_cents;
      return acc;
    }, {});
    parts.push(
      `VENDAS 30d: ${pays.length} pagamentos | total ${brl(total)} | ticket médio ${brl(pays.length ? Math.round(total / pays.length) : 0)}`,
    );
    parts.push(
      `POR MÉTODO: ${Object.entries(byMethod).map(([k, v]) => `${k} ${brl(v)}`).join(", ") || "sem dados"}`,
    );
    parts.push(
      `POR HORA: ${Object.entries(byHour).sort().map(([h, v]) => `${h}h ${brl(v)}`).join(", ") || "sem dados"}`,
    );
  }

  if (agent === "vendas" || agent === "relatorios") {
    const items = await scope(
      supabase
        .from("tab_items")
        .select("name,quantity,unit_price_cents,created_at")
        .gte("created_at", since)
        .limit(1000),
    );
    const agg = ((items.data ?? []) as any[]).reduce<Record<string, { q: number; v: number }>>(
      (acc, it) => {
        const cur = acc[it.name] ?? { q: 0, v: 0 };
        cur.q += it.quantity;
        cur.v += it.quantity * it.unit_price_cents;
        acc[it.name] = cur;
        return acc;
      },
      {},
    );
    const top = Object.entries(agg)
      .sort((a, b) => b[1].v - a[1].v)
      .slice(0, 20);
    parts.push(
      `TOP PRODUTOS VENDIDOS 30d:\n` +
        (top.map(([n, v]) => `${n} | ${v.q} un | ${brl(v.v)}`).join("\n") || "sem dados"),
    );
    const tabs = await scope(
      supabase.from("tabs").select("status,opened_at,closed_at,kind").gte("opened_at", since).limit(500),
    );
    const t: any[] = tabs.data ?? [];
    parts.push(
      `COMANDAS 30d: ${t.length} | abertas agora ${t.filter((x) => x.status === "open").length}`,
    );
  }

  if (agent === "financeiro" || agent === "relatorios") {
    const exp = await scope(
      supabase
        .from("expenses")
        .select("description,amount_cents,due_date,paid,category")
        .order("due_date", { ascending: true })
        .limit(80),
    );
    const list: any[] = exp.data ?? [];
    const aberto = list.filter((e) => !e.paid);
    parts.push(
      `CONTAS A PAGAR em aberto (${aberto.length}) total ${brl(aberto.reduce((s, e) => s + e.amount_cents, 0))}:\n` +
        aberto
          .slice(0, 30)
          .map((e) => `${e.due_date} | ${e.description} | ${brl(e.amount_cents)} | ${e.category}`)
          .join("\n"),
    );
    const reg = await scope(
      supabase
        .from("cash_registers")
        .select("name,status,opened_at,closed_at,opening_cents,closing_counted_cents")
        .order("opened_at", { ascending: false })
        .limit(5),
    );
    parts.push(
      `CAIXAS RECENTES:\n` +
        (((reg.data ?? []) as any[])
          .map((r) => `${r.name} | ${r.status} | abertura ${brl(r.opening_cents)} | ${r.opened_at}`)
          .join("\n") || "sem caixas"),
    );
    const cm = await scope(
      supabase.from("cash_movements").select("kind,amount_cents,description,created_at").gte("created_at", since).limit(300),
    );
    const movs: any[] = cm.data ?? [];
    const inflow = movs.filter((m) => m.kind === "in").reduce((s, m) => s + m.amount_cents, 0);
    const outflow = movs.filter((m) => m.kind !== "in").reduce((s, m) => s + m.amount_cents, 0);
    parts.push(`MOVIMENTOS DE CAIXA 30d: entradas ${brl(inflow)} | saídas ${brl(outflow)}`);
  }

  return parts.join("\n\n");
}

const Input = z.object({
  agent: z.enum(AGENT_IDS),
  storeId: z.string().nullable().optional(),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .min(1)
    .max(30),
});

export const askAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = await buildContext(context.supabase as unknown as Sb, data.agent, data.storeId ?? null);

    const text = await generateAiText({
      instructions: `${SYSTEM[data.agent]}\n\n${BASE_RULES}\n\nData/hora atual: ${new Date().toISOString()}\n\n=== DADOS REAIS DA OPERAÇÃO (últimos 30 dias) ===\n${ctx}`,
      input: data.messages.map((m) => ({
        role: m.role,
        content: [{ type: "input_text" as const, text: m.content }],
      })),
    });

    return { text: text || "Não consegui gerar uma resposta agora. Tente novamente." };
  });
