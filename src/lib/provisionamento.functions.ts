import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const monthRange = (refMonth: string) => {
  const [y, m] = refMonth.split("-").map(Number);
  const start = new Date(Date.UTC(y!, m! - 1, 1));
  const end = new Date(Date.UTC(y!, m!, 0));
  const prevStart = new Date(Date.UTC(y!, m! - 2, 1));
  const prevEnd = new Date(Date.UTC(y!, m! - 1, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    start: iso(start),
    end: iso(end),
    prevStart: iso(prevStart),
    prevEnd: iso(prevEnd),
    firstDay: `${refMonth}-01`,
    fifth: `${refMonth}-05`,
  };
};

const GenInput = z.object({
  storeId: z.string(),
  refMonth: z.string(),
  includeSalaries: z.boolean().optional(),
  includeRecurring: z.boolean().optional(),
});

/** Gera as provisões (contas previstas) do mês a partir do mês anterior e da folha. */
export const gerarProvisionamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GenInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const r = monthRange(data.refMonth);

    const { data: existing } = await supabase
      .from("expenses")
      .select("description")
      .eq("store_id", data.storeId)
      .eq("ref_month", r.firstDay);
    const already = new Set((existing ?? []).map((e) => e.description.trim().toLowerCase()));

    type Row = {
      user_id: string;
      store_id: string;
      description: string;
      amount_cents: number;
      category: string;
      due_date: string;
      paid: boolean;
      provisioned: boolean;
      ref_month: string;
    };
    const rows: Row[] = [];
    const push = (description: string, amount_cents: number, category: string, due_date: string) => {
      const key = description.trim().toLowerCase();
      if (!description.trim() || amount_cents <= 0 || already.has(key)) return;
      already.add(key);
      rows.push({
        user_id: userId,
        store_id: data.storeId,
        description: description.trim(),
        amount_cents,
        category,
        due_date,
        paid: false,
        provisioned: true,
        ref_month: r.firstDay,
      });
    };

    if (data.includeRecurring !== false) {
      const { data: prev } = await supabase
        .from("expenses")
        .select("description,amount_cents,category,due_date")
        .eq("store_id", data.storeId)
        .gte("due_date", r.prevStart)
        .lte("due_date", r.prevEnd)
        .limit(300);
      for (const e of prev ?? []) {
        const day = Number(String(e.due_date).slice(8, 10));
        const lastDay = Number(r.end.slice(8, 10));
        const due = `${data.refMonth}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
        push(e.description, Number(e.amount_cents), e.category, due);
      }
    }

    if (data.includeSalaries !== false) {
      const { data: emps } = await supabase
        .from("employees")
        .select("name,base_salary_cents,pay_type,active")
        .eq("store_id", data.storeId)
        .eq("active", true)
        .limit(200);
      for (const e of emps ?? []) {
        const base = Number(e.base_salary_cents ?? 0);
        if (e.pay_type === "mensal" && base > 0) {
          push(`Salário — ${e.name}`, base, "salarios", r.fifth);
        }
      }
    }

    if (rows.length === 0) return { created: 0, total: 0 };

    const { error } = await supabase.from("expenses").insert(rows);
    if (error) throw new Error(error.message);
    return { created: rows.length, total: rows.reduce((s, x) => s + x.amount_cents, 0) };
  });

const BaixaInput = z.object({
  storeId: z.string(),
  refMonth: z.string(),
  ids: z.array(z.string()).max(300).optional(),
  onlyDue: z.boolean().optional(),
});

/** Assistente financeiro: analisa as provisões do mês e dá baixa nas selecionadas. */
export const baixarProvisoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BaixaInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const r = monthRange(data.refMonth);
    const today = new Date().toISOString().slice(0, 10);

    const { data: provs, error } = await supabase
      .from("expenses")
      .select("id,description,amount_cents,category,due_date,paid")
      .eq("store_id", data.storeId)
      .eq("ref_month", r.firstDay)
      .eq("paid", false)
      .order("due_date", { ascending: true })
      .limit(300);
    if (error) throw new Error(error.message);

    let alvo = provs ?? [];
    if (data.ids?.length) alvo = alvo.filter((p) => data.ids!.includes(p.id));
    else if (data.onlyDue !== false) alvo = alvo.filter((p) => p.due_date <= today);

    if (alvo.length > 0) {
      const { error: upErr } = await supabase
        .from("expenses")
        .update({ paid: true, paid_at: new Date().toISOString(), paid_by: userId })
        .in(
          "id",
          alvo.map((p) => p.id),
        );
      if (upErr) throw new Error(upErr.message);
    }

    const baixado = alvo.reduce((s, p) => s + Number(p.amount_cents), 0);
    const restante = (provs ?? [])
      .filter((p) => !alvo.some((a) => a.id === p.id))
      .reduce((s, p) => s + Number(p.amount_cents), 0);

    // Parecer do Agente Financeiro (opcional — não bloqueia a baixa)
    let parecer = "";
    const key = process.env["LOVABLE_API_KEY"];
    if (key) {
      try {
        const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
        const { data: pays } = await supabase
          .from("payments")
          .select("amount_cents")
          .eq("store_id", data.storeId)
          .gte("paid_at", since)
          .limit(5000);
        const receita = (pays ?? []).reduce((s, p) => s + Number(p.amount_cents), 0);

        const ctx = [
          `Mês de referência: ${data.refMonth}. Hoje: ${today}.`,
          `Receita dos últimos 30 dias: ${brl(receita)}.`,
          `Baixas realizadas agora (${alvo.length}) total ${brl(baixado)}:`,
          alvo.map((p) => `${p.due_date} | ${p.description} | ${brl(Number(p.amount_cents))} | ${p.category}`).join("\n") ||
            "nenhuma",
          `Provisões ainda em aberto: ${brl(restante)}.`,
          ((provs ?? [])
            .filter((p) => !alvo.some((a) => a.id === p.id))
            .slice(0, 30)
            .map((p) => `${p.due_date} | ${p.description} | ${brl(Number(p.amount_cents))} | ${p.category}`)
            .join("\n") || "nenhuma"),
        ].join("\n");

        const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
          body: JSON.stringify({
            model: "openai/gpt-5.6-terra",
            instructions:
              "Você é o Agente Financeiro do SmartPag. Responda em português do Brasil, curto (máx. 8 linhas), confirmando as baixas feitas, o impacto no caixa e as prioridades de pagamento restantes. Não invente números.",
            input: [{ role: "user", content: [{ type: "input_text", text: ctx }] }],
          }),
        });
        if (res.ok) {
          const json: any = await res.json();
          parecer =
            json?.output_text ??
            json?.output?.[0]?.content?.[0]?.text ??
            "";
        }
      } catch {
        /* parecer é opcional */
      }
    }

    return {
      baixados: alvo.length,
      valorBaixado: baixado,
      restante,
      parecer: typeof parecer === "string" ? parecer.trim() : "",
    };
  });
