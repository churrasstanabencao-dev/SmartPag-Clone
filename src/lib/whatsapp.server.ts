import { createHmac, timingSafeEqual } from "node:crypto";

// ============= Twilio config =============

function twilioConfig() {
  const accountSid = process.env["TWILIO_ACCOUNT_SID"];
  const authToken = process.env["TWILIO_AUTH_TOKEN"];
  const from = process.env["TWILIO_WHATSAPP_FROM"];
  if (!accountSid || !authToken || !from) {
    throw new Error(
      "Twilio não configurado. Defina TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_WHATSAPP_FROM.",
    );
  }
  return { accountSid, authToken, from };
}

function basicAuth(sid: string, token: string): string {
  return "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
}

// ============= Send message =============

export async function sendWhatsApp(to: string, body: string): Promise<void> {
  const { accountSid, authToken, from } = twilioConfig();
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: basicAuth(accountSid, authToken),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
      },
    );
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.error("[WhatsApp] Erro ao enviar:", res.status, err.slice(0, 200));
    }
  } catch (e) {
    console.error("[WhatsApp] Falha de rede ao enviar:", e);
  }
}

// ============= Signature validation =============

export function validateTwilioSignature(
  fullUrl: string,
  params: Record<string, string>,
  signature: string | null,
): boolean {
  if (!signature) return false;
  try {
    const { authToken } = twilioConfig();
    const sortedKeys = Object.keys(params).sort();
    let data = fullUrl;
    for (const key of sortedKeys) {
      data += key + (params[key] ?? "");
    }
    const computed = createHmac("sha1", authToken)
      .update(Buffer.from(data, "utf-8"))
      .digest("base64");
    return timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;
  }
}

// ============= Media download =============

export async function downloadTwilioMedia(
  url: string,
): Promise<{ data: Buffer; contentType: string }> {
  const { accountSid, authToken } = twilioConfig();
  const res = await fetch(url, {
    headers: { Authorization: basicAuth(accountSid, authToken) },
  });
  if (!res.ok) throw new Error(`Falha ao baixar mídia: ${res.status}`);
  const data = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  return { data, contentType };
}

// ============= Helpers =============

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Read a streaming Responses API call and accumulate text deltas. */
async function readStreamingText(res: Response): Promise<string> {
  if (!res.body) {
    const json = await res.json().catch(() => null);
    const text =
      json?.output?.find((o: any) => o.type === "message")?.content?.find(
        (c: any) => c.type === "output_text",
      )?.text ?? json?.output_text ?? "";
    return text;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const evt = JSON.parse(payload);
        if (
          evt.type === "response.output_text.delta" &&
          typeof evt.delta === "string"
        ) {
          text += evt.delta;
        }
      } catch {
        /* ignore partial */
      }
    }
  }
  return text;
}

// ============= AI context =============

async function buildWhatsAppContext(supabaseAdmin: any, storeId: string): Promise<string> {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const sc = (q: any) => q.eq("store_id", storeId);
  const parts: string[] = [];

  const { data: prods } = await sc(
    supabaseAdmin
      .from("products")
      .select("name,sku,stock_qty,min_stock,cost_cents,price_cents,active")
      .eq("active", true)
      .order("stock_qty", { ascending: true })
      .limit(60),
  );
  const abaixo = (prods ?? []).filter((p: any) => p.stock_qty <= p.min_stock);
  parts.push(
    `PRODUTOS (${prods?.length ?? 0}):\n${(prods ?? [])
      .map(
        (p: any) =>
          `${p.name} | saldo ${p.stock_qty} | mín ${p.min_stock} | custo ${brl(p.cost_cents)} | venda ${brl(p.price_cents)}`,
      )
      .join("\n")}`,
  );
  if (abaixo.length)
    parts.push(
      `ABAIXO DO MÍNIMO: ${abaixo.map((p: any) => `${p.name} (${p.stock_qty}/${p.min_stock})`).join(", ")}`,
    );

  const { data: pays } = await sc(
    supabaseAdmin
      .from("payments")
      .select("amount_cents,method,paid_at")
      .gte("paid_at", since)
      .limit(500),
  );
  const total = (pays ?? []).reduce((s: number, p: any) => s + p.amount_cents, 0);
  parts.push(
    `VENDAS 30d: ${pays?.length ?? 0} pagamentos | total ${brl(total)} | ticket médio ${brl(pays?.length ? Math.round(total / pays.length) : 0)}`,
  );

  const { data: regs } = await sc(
    supabaseAdmin
      .from("cash_registers")
      .select("name,status,opened_at,opening_cents")
      .order("opened_at", { ascending: false })
      .limit(3),
  );
  parts.push(
    `CAIXAS: ${(regs ?? []).map((r: any) => `${r.name} | ${r.status}`).join(", ") || "nenhum aberto"}`,
  );

  const { data: exps } = await sc(
    supabaseAdmin
      .from("expenses")
      .select("description,amount_cents,due_date,paid,category")
      .eq("paid", false)
      .order("due_date", { ascending: true })
      .limit(10),
  );
  const openTotal = (exps ?? []).reduce((s: number, e: any) => s + e.amount_cents, 0);
  parts.push(`CONTAS A PAGAR: ${exps?.length ?? 0} em aberto | total ${brl(openTotal)}`);

  const { data: movs } = await sc(
    supabaseAdmin
      .from("stock_movements")
      .select("quantity,reason,created_at")
      .gte("created_at", since)
      .limit(200),
  );
  parts.push(`MOVIMENTAÇÕES 30d: ${movs?.length ?? 0} lançamentos`);

  return parts.join("\n\n");
}

// ============= AI text query =============

export async function askWhatsAppAI(
  storeId: string,
  userMessage: string,
  history: { role: string; content: string }[],
): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("IA indisponível: chave não configurada.");

  const ctx = await buildWhatsAppContext(supabaseAdmin, storeId);

  const systemPrompt = `Você é o assistente SmartPag no WhatsApp. Responda SEMPRE em português do Brasil, de forma curta e objetiva (máx 3-4 frases). Use os dados reais fornecidos. Formate valores em R$. Não invente números. Se faltar dado, diga o que falta.

Data/hora atual: ${new Date().toISOString()}

=== DADOS DA LOJA (últimos 30 dias) ===
${ctx}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: "openai/gpt-5.6-terra",
      stream: true,
      instructions: systemPrompt,
      input: [
        ...history.slice(-6).map((m) => ({
          role: m.role,
          content: [
            {
              type: m.role === "user" ? "input_text" : "output_text",
              text: m.content,
            },
          ],
        })),
        {
          role: "user",
          content: [{ type: "input_text", text: userMessage }],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429)
      return "Muitas solicitações. Tente novamente em instantes.";
    if (res.status === 402)
      return "Créditos de IA esgotados. Adicione créditos no Lovable.";
    return `Erro na IA (${res.status}). Tente novamente.`;
  }

  const text = await readStreamingText(res);
  return text.trim() || "Não consegui processar agora. Tente novamente.";
}

// ============= Invoice extraction via AI vision =============

type InvoiceData = {
  products: { name: string; quantity: number; unit_cost: number }[];
  supplier: string;
  total: number;
};

export async function extractInvoiceFromImage(
  imageData: Buffer,
  contentType: string,
  storeId: string,
): Promise<InvoiceData> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("IA indisponível");

  const { data: catalog } = await supabaseAdmin
    .from("products")
    .select("id,name,sku")
    .eq("active", true)
    .eq("store_id", storeId)
    .limit(200);

  const catalogStr =
    (catalog ?? []).map((p: any) => `${p.name} (SKU: ${p.sku ?? "—"})`).join("\n") ||
    "catálogo vazio";

  const base64 = imageData.toString("base64");
  const dataUrl = `data:${contentType};base64,${base64}`;

  const prompt = `Analise esta imagem de nota fiscal/cupom fiscal/recibo de compra.
Extraia os produtos no formato JSON exato:
{"products": [{"name": "nome do produto", "quantity": N, "unit_cost": X.XX}], "supplier": "nome do fornecedor", "total": X.XX}

Catálogo de produtos da loja para referência:
${catalogStr}

Tente corresponder os produtos da nota aos produtos do catálogo pelo nome.
Responda APENAS com o JSON, sem texto adicional.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: "openai/gpt-5.6-terra",
      stream: true,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: dataUrl },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`IA vision falhou (${res.status}): ${body.slice(0, 150)}`);
  }

  const text = await readStreamingText(res);
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Não consegui extrair produtos da imagem.");

  const parsed = JSON.parse(jsonMatch[0]) as InvoiceData;
  if (!parsed.products?.length)
    throw new Error("Nenhum produto encontrado na nota.");
  return parsed;
}

// ============= Stock entry =============

export async function executeStockEntry(
  storeId: string,
  invoice: InvoiceData,
): Promise<{ ok: boolean; message: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: store } = await supabaseAdmin
    .from("stores")
    .select("owner_id")
    .eq("id", storeId)
    .single();
  if (!store) throw new Error("Loja não encontrada");
  const userId = store.owner_id;

  const { data: catalog } = await supabaseAdmin
    .from("products")
    .select("id,name,sku")
    .eq("active", true)
    .eq("store_id", storeId);

  const matched: {
    product_id: string | null;
    name: string;
    quantity: number;
    unit_cost_cents: number;
    total_cents: number;
  }[] = [];
  let totalCents = 0;
  let unmatched = 0;

  for (const item of invoice.products) {
    const match = (catalog ?? []).find(
      (p: any) =>
        p.name.toLowerCase().includes(item.name.toLowerCase()) ||
        item.name.toLowerCase().includes(p.name.toLowerCase()) ||
        (p.sku && p.sku === item.name),
    );
    const unitCostCents = Math.round(item.unit_cost * 100);
    const lineTotalCents = unitCostCents * item.quantity;
    totalCents += lineTotalCents;
    if (!match) unmatched++;
    matched.push({
      product_id: match?.id ?? null,
      name: item.name,
      quantity: item.quantity,
      unit_cost_cents: unitCostCents,
      total_cents: lineTotalCents,
    });
  }

  const { data: purchase, error: purErr } = await supabaseAdmin
    .from("purchases")
    .insert({
      user_id: userId,
      store_id: storeId,
      supplier: invoice.supplier || "Não identificado",
      issued_at: new Date().toISOString().slice(0, 10),
      total_cents: totalCents,
      freight_cents: 0,
      discount_cents: 0,
      status: "sent",
      notes: "Entrada via WhatsApp (foto de nota fiscal)",
    })
    .select()
    .single();

  if (purErr || !purchase)
    throw new Error(`Erro ao criar compra: ${purErr?.message}`);

  const items = matched.map((m) => ({
    user_id: userId,
    store_id: storeId,
    purchase_id: purchase.id,
    product_id: m.product_id,
    name: m.name,
    quantity: m.quantity,
    unit_cost_cents: m.unit_cost_cents,
    total_cents: m.total_cents,
    received_quantity: m.quantity,
  }));

  const { error: itemsErr } = await supabaseAdmin
    .from("purchase_items")
    .insert(items);
  if (itemsErr) throw new Error(`Erro ao criar itens: ${itemsErr.message}`);

  const { error: approveErr } = await supabaseAdmin.rpc("approve_purchase", {
    _purchase_id: purchase.id,
  });
  if (approveErr)
    throw new Error(`Erro ao aprovar compra: ${approveErr.message}`);

  const msg =
    `✅ *Entrada registrada!*\n` +
    `${matched.length} produtos | Total: ${brl(totalCents)}\n` +
    `Fornecedor: ${invoice.supplier || "Não identificado"}\n` +
    (unmatched > 0 ? `⚠️ ${unmatched} produto(s) não correspondidos ao catálogo\n` : "") +
    `Estoque e custo médio atualizados.`;

  return { ok: true, message: msg };
}

// ============= Main message processor =============

export async function processIncomingMessage(
  from: string,
  body: string,
  mediaUrls: string[],
): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Check whitelist
  const { data: contact } = await supabaseAdmin
    .from("whatsapp_contacts")
    .select("id,store_id,name")
    .eq("phone", from)
    .eq("active", true)
    .single();

  if (!contact) {
    return "Olá! Este número não está autorizado. Solicite acesso ao gestor da loja no SmartPag.";
  }

  const storeId = contact.store_id;
  if (!storeId) {
    return "Erro: contato sem loja vinculada. Configure no SmartPag.";
  }

  // Log incoming message
  await supabaseAdmin.from("whatsapp_messages").insert({
    phone: from,
    direction: "in",
    body,
    media_url: mediaUrls[0] ?? null,
    store_id: storeId,
  });

  const cmd = body.trim().toLowerCase();

  // Confirmation commands
  if (cmd === "confirmar" || cmd === "confirmar entrada" || cmd === "ok") {
    const { data: pending } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("id,pending_action")
      .eq("phone", from)
      .not("pending_action", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (pending?.pending_action) {
      try {
        const result = await executeStockEntry(
          storeId,
          pending.pending_action as InvoiceData,
        );
        await supabaseAdmin
          .from("whatsapp_messages")
          .update({ pending_action: null })
          .eq("id", pending.id);
        return result.message;
      } catch (e) {
        return `❌ Erro: ${e instanceof Error ? e.message : "Falha ao processar entrada"}`;
      }
    }
    return "Não há entrada pendente para confirmar.";
  }

  if (cmd === "cancelar") {
    const { data: pending } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("id")
      .eq("phone", from)
      .not("pending_action", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (pending) {
      await supabaseAdmin
        .from("whatsapp_messages")
        .update({ pending_action: null })
        .eq("id", pending.id);
    }
    return "Entrada cancelada.";
  }

  // Invoice photo processing
  if (mediaUrls.length > 0) {
    await sendWhatsApp(from, "📸 Processando a nota fiscal...");
    try {
      const { data: mediaData, contentType } =
        await downloadTwilioMedia(mediaUrls[0]!);
      const invoice = await extractInvoiceFromImage(
        mediaData,
        contentType,
        storeId,
      );

      const lines = invoice.products
        .map((p) => `• ${p.name} x${p.quantity} — R$ ${p.unit_cost.toFixed(2)}/un`)
        .join("\n");
      const summary =
        `📋 *Nota fiscal lida!*\n\n${lines}\n\n` +
        `*Total: R$ ${invoice.total.toFixed(2)}*\n` +
        `Fornecedor: ${invoice.supplier || "Não identificado"}\n\n` +
        `Responda *CONFIRMAR* para dar entrada no estoque ou *CANCELAR*.`;

      // Store pending action
      await supabaseAdmin.from("whatsapp_messages").insert({
        phone: from,
        direction: "in",
        body: "Confirmação pendente",
        store_id: storeId,
        pending_action: invoice as any,
      });

      return summary;
    } catch (e) {
      return `❌ Não consegui ler a nota fiscal: ${e instanceof Error ? e.message : "erro desconhecido"}. Tente enviar uma foto mais nítida.`;
    }
  }

  // Text query → AI
  try {
    const { data: recent } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("direction,body")
      .eq("phone", from)
      .order("created_at", { ascending: false })
      .limit(12);

    const history = (recent ?? [])
      .reverse()
      .filter((m: any) => m.body)
      .slice(-6)
      .map((m: any) => ({
        role: m.direction === "in" ? "user" : "assistant",
        content: m.body,
      }));

    return await askWhatsAppAI(storeId, body, history);
  } catch (e) {
    return `❌ Erro ao consultar: ${e instanceof Error ? e.message : "falha"}`;
  }
}
