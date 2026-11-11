import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const METHODS = [
  "dinheiro",
  "debito",
  "credito",
  "picpay",
  "pix",
  "ifood",
  "outros",
] as const;

const SaleSchema = z.object({
  date: z.string(),
  description: z.string(),
  method: z.enum(METHODS).catch("outros"),
  amount: z.number(),
});
export type ParsedSale = z.infer<typeof SaleSchema>;

const ParseInput = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  fileBase64: z.string().min(10),
});

function jsonFromText(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("A IA não retornou dados estruturados.");
  return JSON.parse(raw.slice(start, end + 1));
}

async function readStream(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  for (;;) {
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
        if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") {
          text += evt.delta;
        }
      } catch {
        /* ignore partial chunk */
      }
    }
  }
  return text;
}

const PROMPT = `Você é o Agente de Transição de Sistemas de um ERP de restaurante.
Recebe um relatório de VENDAS exportado de OUTRO sistema (PDF, cupom, planilha impressa ou print).
Extraia TODAS as vendas/pagamentos encontrados e responda SOMENTE com JSON válido, sem texto extra:

{"sales":[{"date":"YYYY-MM-DD","description":"texto curto (mesa/comanda/pedido/cliente)","method":"dinheiro|debito|credito|picpay|pix|ifood|outros","amount":123.45}],"source":"nome do sistema de origem se aparecer","notes":"observações curtas"}

Regras:
- amount é o valor TOTAL da venda em reais (número, ponto decimal, sem R$).
- Nunca invente linhas; extraia apenas o que está no documento.
- Se a data não aparecer na linha, use a data do relatório.
- Converta a forma de pagamento para uma das opções listadas ("cartão de crédito" -> credito, "TEF débito" -> debito, "dinheiro/espécie" -> dinheiro, delivery iFood -> ifood, desconhecido -> outros).
- Ignore linhas de total, subtotal, taxa de serviço isolada e cabeçalhos.`;

export const parseSalesDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ParseInput.parse(d))
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("IA indisponível: chave não configurada.");

    const dataUrl = `data:${data.contentType};base64,${data.fileBase64}`;
    const isImage = data.contentType.startsWith("image/");
    const content = isImage
      ? [
          { type: "input_text", text: "Extraia as vendas deste documento." },
          { type: "input_image", image_url: dataUrl },
        ]
      : [
          { type: "input_text", text: "Extraia as vendas deste documento." },
          { type: "input_file", filename: data.fileName, file_data: dataUrl },
        ];

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3-pro-preview",
        stream: true,
        instructions: PROMPT,
        input: [{ role: "user", content }],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("Muitas solicitações. Tente novamente em instantes.");
      if (res.status === 402)
        throw new Error("Créditos de IA esgotados. Adicione créditos no Lovable para continuar.");
      throw new Error(`Falha ao ler o documento (${res.status}): ${body.slice(0, 200)}`);
    }

    const text = await readStream(res);
    const parsed = jsonFromText(text) as {
      sales?: unknown;
      source?: unknown;
      notes?: unknown;
    };

    const sales = z
      .array(SaleSchema)
      .catch([])
      .parse(Array.isArray(parsed.sales) ? parsed.sales : [])
      .filter((s) => Number.isFinite(s.amount) && s.amount > 0);

    return {
      sales,
      source: typeof parsed.source === "string" ? parsed.source : "",
      notes: typeof parsed.notes === "string" ? parsed.notes : "",
    };
  });

const ImportInput = z.object({
  storeId: z.string().uuid(),
  registerId: z.string().uuid().nullable().optional(),
  sales: z.array(SaleSchema).min(1).max(500),
});

export const importParsedSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ImportInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const rows = data.sales.map((s) => {
      const day = /^\d{4}-\d{2}-\d{2}$/.test(s.date) ? s.date : new Date().toISOString().slice(0, 10);
      return {
        user_id: userId,
        store_id: data.storeId,
        register_id: data.registerId ?? null,
        tab_id: null,
        method: s.method,
        amount_cents: Math.round(s.amount * 100),
        paid_at: new Date(`${day}T12:00:00Z`).toISOString(),
      };
    });

    const { error, data: inserted } = await supabase.from("payments").insert(rows).select("id");
    if (error) throw new Error(`Falha ao importar vendas: ${error.message}`);

    return {
      imported: inserted?.length ?? rows.length,
      totalCents: rows.reduce((s, r) => s + r.amount_cents, 0),
    };
  });
