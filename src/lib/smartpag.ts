export type PaymentMethod =
  | "dinheiro"
  | "debito"
  | "credito"
  | "picpay"
  | "pix"
  | "ifood"
  | "outros";

export const PAYMENT_METHODS: {
  id: PaymentMethod;
  label: string;
  tone: string;
  chart: string;
}[] = [
  { id: "dinheiro", label: "Dinheiro", tone: "bg-chart-2/12 text-chart-2", chart: "var(--chart-2)" },
  { id: "debito", label: "Débito", tone: "bg-chart-1/12 text-chart-1", chart: "var(--chart-1)" },
  { id: "credito", label: "Crédito", tone: "bg-chart-3/15 text-chart-3", chart: "var(--chart-3)" },
  { id: "picpay", label: "PicPay", tone: "bg-chart-6/15 text-chart-6", chart: "var(--chart-6)" },
  { id: "pix", label: "PIX", tone: "bg-chart-5/12 text-chart-5", chart: "var(--chart-5)" },
  { id: "ifood", label: "iFood", tone: "bg-chart-4/12 text-chart-4", chart: "var(--chart-4)" },
  { id: "outros", label: "Outros", tone: "bg-chart-7/15 text-chart-7", chart: "var(--chart-7)" },
];

export const methodLabel = (id: string) =>
  PAYMENT_METHODS.find((m) => m.id === id)?.label ??
  (id === "transferencia" ? "Transferência entre lojas" : id);

export const TAB_KINDS = ["mesa", "balcão", "delivery", "comanda"] as const;

export const EXPENSE_CATEGORIES = [
  "geral",
  "insumos",
  "aluguel",
  "salários",
  "energia",
  "marketing",
  "impostos",
] as const;

export const STOCK_REASONS = [
  { id: "compra", label: "Compra / recebimento", kind: "entrada" },
  { id: "producao", label: "Produção", kind: "entrada" },
  { id: "ajuste_entrada", label: "Ajuste positivo", kind: "entrada" },
  { id: "venda", label: "Venda / consumo", kind: "saida" },
  { id: "perda", label: "Perda / quebra", kind: "saida" },
  { id: "uso_cozinha", label: "Uso na cozinha", kind: "saida" },
  { id: "ajuste_saida", label: "Ajuste negativo", kind: "saida" },
] as const;

export const stockReasonLabel = (id: string) =>
  STOCK_REASONS.find((r) => r.id === id)?.label ?? id;
