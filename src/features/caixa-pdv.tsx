import { Banknote, CreditCard, Printer, Wallet } from "lucide-react";
import { brl, dateTime } from "@/lib/format";
import { PAYMENT_METHODS, methodLabel } from "@/lib/smartpag";
import { IconTile } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { CashCountCard } from "@/features/fechamento-caixa";

export type CashRegister = {
  id: string;
  name: string;
  opening_cents: number;
  opened_at: string;
  closed_at: string | null;
  status: string;
};

export type PaymentRow = {
  id: string;
  method: string;
  amount_cents: number;
  paid_at: string;
};

export type MovementRow = {
  id: string;
  kind: string;
  description: string;
  amount_cents: number;
  method: string;
  created_at: string;
};

/**
 * Tela de Caixa dentro do PDV: consolida dinheiro e cartão, oferece o
 * fechamento do dia (conferência de cédulas + total de cartão) e um relatório
 * do turno que pode ser impresso — tudo sem sair do app.
 */
export function CaixaScreen({
  register,
  payments,
  movements,
  expectedCash,
  onDone,
}: {
  register: CashRegister;
  payments: PaymentRow[];
  movements: MovementRow[];
  expectedCash: number;
  onDone: () => void;
}) {
  const salesTotal = payments.reduce((s, p) => s + Number(p.amount_cents), 0);
  const dinheiroVendas = payments
    .filter((p) => p.method === "dinheiro")
    .reduce((s, p) => s + Number(p.amount_cents), 0);
  const cartaoVendas = payments
    .filter((p) => p.method === "debito" || p.method === "credito")
    .reduce((s, p) => s + Number(p.amount_cents), 0);
  const inflow = movements
    .filter((m) => m.kind === "entrada")
    .reduce((s, m) => s + Number(m.amount_cents), 0);
  const outflow = movements
    .filter((m) => m.kind === "saida")
    .reduce((s, m) => s + Number(m.amount_cents), 0);
  const cashInflow = movements
    .filter((m) => m.kind === "entrada" && m.method === "dinheiro")
    .reduce((s, m) => s + Number(m.amount_cents), 0);
  const cashOutflow = movements
    .filter((m) => m.kind === "saida" && m.method === "dinheiro")
    .reduce((s, m) => s + Number(m.amount_cents), 0);
  const result = salesTotal + inflow - outflow;
  const opening = Number(register.opening_cents ?? 0);
  // dinheiro esperado na gaveta = abertura + vendas em dinheiro + suprimentos - sangrias
  const expectedCashGaveta = opening + dinheiroVendas + cashInflow - cashOutflow;

  const printReport = () => {
    const byMethod = PAYMENT_METHODS.map((m) => {
      const v = payments
        .filter((p) => p.method === m.id)
        .reduce((s, p) => s + Number(p.amount_cents), 0);
      return `<tr><td>${methodLabel(m.id)}</td><td style="text-align:right">${brl(v)}</td></tr>`;
    }).join("");
    const movRows = movements
      .map(
        (m) =>
          `<tr><td>${m.kind === "entrada" ? "Entrada" : "Saída"}</td><td>${m.description}</td><td>${methodLabel(m.method)}</td><td style="text-align:right">${m.kind === "entrada" ? "+" : "-"}${brl(Number(m.amount_cents))}</td></tr>`,
      )
      .join("");
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de caixa — ${register.name}</title>
<style>
body{font-family:ui-sans-serif,system-ui,Arial;color:#111;padding:24px;max-width:680px;margin:auto}
h1{font-size:18px;margin:0 0 4px} small{color:#666}
table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px}
th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left}
th{background:#f5f5f5}
.total{font-weight:700;font-size:15px}
.kpi{display:flex;gap:16px;flex-wrap:wrap;margin:12px 0}
.kpi div{flex:1;min-width:140px;border:1px solid #ddd;border-radius:8px;padding:10px}
.kpi p{margin:0;color:#666;font-size:11px}.kpi b{font-size:16px}
</style></head><body>
<h1>Relatório de fechamento de caixa</h1>
<small>${register.name} · Aberto em ${dateTime(register.opened_at)} · Fechado em ${dateTime(new Date().toISOString())}</small>
<div class="kpi">
<div><p>Dinheiro (vendas)</p><b>${brl(dinheiroVendas)}</b></div>
<div><p>Cartão (débito+crédito)</p><b>${brl(cartaoVendas)}</b></div>
<div><p>Total vendido</p><b>${brl(salesTotal)}</b></div>
<div><p>Resultado do turno</p><b>${brl(result)}</b></div>
</div>
<h3>Recebimentos por forma de pagamento</h3>
<table><tr><th>Forma</th><th style="text-align:right">Total</th></tr>${byMethod}
<tr class="total"><td>Total geral</td><td style="text-align:right">${brl(salesTotal)}</td></tr></table>
<h3>Entradas e saídas (${movements.length})</h3>
<table><tr><th>Tipo</th><th>Descrição</th><th>Forma</th><th style="text-align:right">Valor</th></tr>${movRows || '<tr><td colspan=4 style="color:#999">Sem movimentos</td></tr>'}</table>
<h3>Conferência de dinheiro</h3>
<table>
<tr><td>Abertura (fundo de troco)</td><td style="text-align:right">${brl(opening)}</td></tr>
<tr><td>Dinheiro esperado na gaveta</td><td style="text-align:right">${brl(expectedCashGaveta)}</td></tr>
<tr class="total"><td>Entradas líquidas (entradas - saídas)</td><td style="text-align:right">${brl(inflow - outflow)}</td></tr>
</table>
</body></html>`;
    const w = window.open("", "_blank", "width=720,height=900");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Dinheiro (vendas)",
            value: dinheiroVendas,
            tone: "bg-chart-2/12 text-chart-2",
            hint: `Gaveta esperada ${brl(expectedCashGaveta)}`,
          },
          {
            label: "Cartão (débito + crédito)",
            value: cartaoVendas,
            tone: "bg-chart-1/12 text-chart-1",
            hint: `${payments.filter((p) => p.method === "debito" || p.method === "credito").length} pagamento(s)`,
          },
          {
            label: "Total vendido",
            value: salesTotal,
            tone: "bg-chart-3/15 text-chart-3",
            hint: `${payments.length} pagamento(s) no turno`,
          },
          {
            label: "Resultado do turno",
            value: result,
            tone: "bg-muted text-foreground",
            hint: `Entradas ${brl(inflow)} · Saídas ${brl(outflow)}`,
          },
        ].map((c) => (
          <div key={c.label} className="card-surface p-5">
            <p className="text-xs font-semibold text-muted-foreground">{c.label}</p>
            <p className="mt-1 text-2xl font-black">{brl(c.value)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{c.hint}</p>
            <span className={`mt-3 inline-block h-1.5 w-10 rounded-full ${c.tone}`} />
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        {/* Fechar o dia */}
        <div className="space-y-4">
          <div className="card-surface p-5">
            <div className="flex items-center gap-3">
              <IconTile icon={CreditCard} tone="bg-chart-1/12 text-chart-1" />
              <div>
                <h3 className="font-bold">Cartão do turno</h3>
                <p className="text-xs text-muted-foreground">
                  Conferir com a maquininha antes de fechar.
                </p>
              </div>
            </div>
            <div className="mt-3 divide-y divide-border text-sm">
              {[
                { id: "debito", label: "Débito" },
                { id: "credito", label: "Crédito" },
              ].map((m) => {
                const v = payments
                  .filter((p) => p.method === m.id)
                  .reduce((s, p) => s + Number(p.amount_cents), 0);
                return (
                  <div key={m.id} className="flex items-center justify-between py-2">
                    <span className="font-semibold">{m.label}</span>
                    <span className="font-bold">{brl(v)}</span>
                  </div>
                );
              })}
              <div className="flex items-center justify-between py-2 font-black">
                <span>Total cartão</span>
                <span>{brl(cartaoVendas)}</span>
              </div>
            </div>
          </div>

          <CashCountCard
            registerId={register.id}
            expectedCash={expectedCash}
            onDone={onDone}
          />
        </div>

        {/* Relatório do turno */}
        <div className="space-y-4">
          <div className="card-surface">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h3 className="font-bold">Relatório do caixa</h3>
              <Button variant="outline" size="sm" onClick={printReport}>
                <Printer className="size-4" /> Imprimir
              </Button>
            </div>
            <div className="divide-y divide-border">
              {PAYMENT_METHODS.map((m) => {
                const value = payments
                  .filter((p) => p.method === m.id)
                  .reduce((s, p) => s + Number(p.amount_cents), 0);
                return (
                  <div key={m.id} className="flex items-center gap-3 px-5 py-2.5">
                    <span className={`size-7 rounded-lg ${m.tone}`} />
                    <span className="text-sm font-semibold">{methodLabel(m.id)}</span>
                    <span className="ml-auto text-sm font-bold">{brl(value)}</span>
                  </div>
                );
              })}
              <div className="flex items-center gap-3 px-5 py-3">
                <span className="text-sm font-bold">Resultado do turno</span>
                <span className="ml-auto text-base font-black">{brl(result)}</span>
              </div>
            </div>
          </div>

          <div className="card-surface">
            <h3 className="border-b border-border px-5 py-3 font-bold">
              Entradas e saídas ({movements.length})
            </h3>
            <div className="divide-y divide-border">
              {movements.length === 0 && (
                <p className="p-10 text-center text-sm text-muted-foreground">
                  Nenhum movimento registrado neste caixa.
                </p>
              )}
              {movements.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-5 py-3">
                  <IconTile
                    icon={m.kind === "entrada" ? Banknote : Wallet}
                    tone={
                      m.kind === "entrada"
                        ? "bg-chart-2/12 text-chart-2"
                        : "bg-destructive/10 text-destructive"
                    }
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{m.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {methodLabel(m.method)} · {dateTime(m.created_at)}
                    </p>
                  </div>
                  <span
                    className={`ml-auto text-sm font-bold ${
                      m.kind === "entrada" ? "text-chart-2" : "text-destructive"
                    }`}
                  >
                    {m.kind === "entrada" ? "+" : "-"}
                    {brl(Number(m.amount_cents))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
