type AiText = { type: "input_text"; text: string };
type AiImage = { type: "input_image"; image_url: string };
type AiFile = { type: "input_file"; filename: string; file_data: string };
export type AiContent = AiText | AiImage | AiFile;

export type AiTurn = {
  role: "user" | "assistant" | "system";
  content: AiContent[];
};

type AiSettings = {
  apiKey: string;
  baseUrl: string;
  model: string;
  visionModel: string;
};

const DEFAULT_BASE_URL = "https://ai-gateway.vercel.sh/v1";
const DEFAULT_MODEL = "openai/gpt-4.1-mini";

export class AiNotConfiguredError extends Error {
  constructor() {
    super("IA indisponível: defina AI_GATEWAY_API_KEY (ou AI_API_KEY com AI_BASE_URL).");
    this.name = "AiNotConfiguredError";
  }
}

export function aiSettings(): AiSettings | null {
  const apiKey = process.env["AI_GATEWAY_API_KEY"] || process.env["AI_API_KEY"];
  if (!apiKey) return null;
  const baseUrl = (process.env["AI_BASE_URL"] || DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = process.env["AI_MODEL"] || DEFAULT_MODEL;
  const visionModel = process.env["AI_VISION_MODEL"] || model;
  return { apiKey, baseUrl, model, visionModel };
}

export function aiHttpError(status: number, body: string): Error {
  if (status === 429) return new Error("Muitas solicitações. Tente novamente em instantes.");
  if (status === 402) return new Error("Créditos de IA esgotados.");
  return new Error(`Falha na IA (${status}): ${body.slice(0, 200)}`);
}

export async function generateAiText(options: {
  instructions?: string;
  input: AiTurn[];
  vision?: boolean;
}): Promise<string> {
  const settings = aiSettings();
  if (!settings) throw new AiNotConfiguredError();

  const res = await fetch(`${settings.baseUrl}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: options.vision ? settings.visionModel : settings.model,
      stream: true,
      ...(options.instructions ? { instructions: options.instructions } : {}),
      input: options.input,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw aiHttpError(res.status, body);
  }

  const text = await readAiText(res);
  return text.trim();
}

export async function readAiText(res: Response): Promise<string> {
  if (!res.body) {
    const json = (await res.json().catch(() => null)) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    } | null;
    return (
      json?.output_text ??
      json?.output?.[0]?.content?.find((part) => part.type === "output_text")?.text ??
      ""
    );
  }

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
        const evt = JSON.parse(payload) as {
          type?: string;
          delta?: string;
          output_text?: string;
        };
        if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") {
          text += evt.delta;
        } else if (!text && typeof evt.output_text === "string") {
          text = evt.output_text;
        }
      } catch {
        /* ignore partial chunk */
      }
    }
  }
  return text;
}
