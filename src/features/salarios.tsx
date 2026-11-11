import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Wallet, Calculator } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId } from "@/lib/store";
import { brl, parseBRLToCents } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

const monthKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const monthRange = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  const from = new Date(y!, (mo ?? 1) - 1, 1);
  const to = new Date(y!, mo ?? 1, 0);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  return { from: iso(from), to: iso(to), fromISO: from.toISOString(), toISO: new Date(y!, mo ?? 1, 0, 23, 59, 59).toISOString() };
};

const CREDIT = ["diaria", "dobra", "gratificacao", "comissao"];
const DEBIT = ["consumo", "vale", "desconto"];

export function Salarios() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(monthKey());
  const range = useMemo(() => monthRange(month), [month]);

  const { data: employees = [] } = useQuery({
    queryKey: ["employees", "salarios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, name, job_title, active, commission_pct, base_salary_cents, pay_type")
        .eq("store_id", currentStoreId())
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: tabs = [] } = useQuery({
    queryKey: ["salarios", "tabs", month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tabs")
        .select("id, employee_id, closed_at")
        .eq("store_id", currentStoreId())
        .eq("status", "closed")
        .gte("closed_at", range.fromISO)
        .lte("closed_at", range.toISO);
      if (error) throw error;
      return data;
    },
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["salarios", "payments", month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("tab_id, amount_cents")
        .eq("store_id", currentStoreId())
        .gte("paid_at", range.fromISO)
        .lte("paid_at", range.toISO);
      if (error) throw error;
      return data;
    },
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["salarios", "entries", month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_entries")
        .select("id, employee_id, kind, amount_cents")
        .eq("store_id", currentStoreId())
        .gte("ref_date", range.from)
        .lte("ref_date", range.to);
      if (error) throw error;
      return data;
    },
  });

  const totalByTab = new Map<string, number>();
  for (const p of payments) {
    if (!p.tab_id) continue;
    totalByTab.set(p.tab_id, (totalByTab.get(p.tab_id) ?? 0) + Number(p.amount_cents));
  }

  const rows = employees.map((e) => {
    const own = tabs.filter((t) => t.employee_id === e.id);
    const vendas = own.reduce((s, t) => s + (totalByTab.get(t.id) ?? 0), 0);
    const pct = Number(e.commission_pct ?? 0);
    const comissaoCalculada = Math.round((vendas * pct) / 100);
    const mine = entries.filter((x) => x.employee_id === e.id);
    const sum = (kinds: string[]) =>
      mine
        .filter((x) => kinds.includes(x.kind))
        .reduce((s, x) => s + Number(x.amount_cents || 0), 0);
    const comissaoLancada = sum(["comissao"]);
    const base = Number(e.base_salary_cents ?? 0);
    const gratificacoes = sum(["gratificacao"]);
    const diarias = sum(["diaria", "dobra"]);
    const descontos = sum(DEBIT);
    const proventos = base + comissaoLancada + gratificacoes + diarias;
    return {
      ...e,
      vendas,
      pct,
      comissaoCalculada,
      comissaoLancada,
      base,
      gratificacoes,
      diarias,
      descontos,
      liquido: proventos - descontos,
    };
  });

  const totalFolha = rows.reduce((s, r) => s + r.liquido, 0);
  const totalBase = rows.reduce((s, r) => s + r.base, 0);
  const totalComissao = rows.reduce((s, r) => s + r.comissaoLancada, 0);
  const totalGrat = rows.reduce((s, r) => s + r.gratificacoes + r.diarias, 0);

  const saveBase = useMutation({
    mutationFn: async (v: {
      id: string;
      patch: { base_salary_cents?: number; pay_type?: string; commission_pct?: number };
    }) => {
      const { error } = await supabase.from("employees").update(v.patch).eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Salário atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const gerarComissoes = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const pend = rows.filter((r) => r.comissaoCalculada > r.comissaoLancada);
      if (pend.length === 0) throw new Error("Nenhuma comissão pendente no mês");
      const payload = pend.map((r) => ({
        user_id: auth.user!.id,
        store_id: currentStoreId(),
        employee_id: r.id,
        kind: "comissao",
        description: `Comissão ${month} (${r.pct}% sobre ${brl(r.vendas)})`,
        amount_cents: r.comissaoCalculada - r.comissaoLancada,
        ref_date: range.to,
      }));
      const { error } = await supabase.from("employee_entries").insert(payload);
      if (error) throw error;
      return pend.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["salarios"] });
      qc.invalidateQueries({ queryKey: ["employee-entries"] });
      toast.success(`${n} comissão(ões) lançada(s) na conta do funcionário`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportCsv = () => {
    const header =
      "Funcionario;Cargo;Tipo;Salario base;Comissao;Diarias e dobras;Gratificacoes;Descontos;Liquido\n";
    const body = rows
      .map((r) =>
        [
          r.name,
          r.job_title,
          r.pay_type,
          (r.base / 100).toFixed(2),
          (r.comissaoLancada / 100).toFixed(2),
          (r.diarias / 100).toFixed(2),
          (r.gratificacoes / 100).toFixed(2),
          (r.descontos / 100).toFixed(2),
          (r.liquido / 100).toFixed(2),
        ].join(";"),
      )
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([header + body], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `folha-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-end gap-3 p-5">
        <div className="space-y-2">
          <Label>Mês de referência</Label>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <Button
          variant="secondary"
          onClick={() => gerarComissoes.mutate()}
          disabled={gerarComissoes.isPending}
        >
          <Calculator className="mr-2 size-4" /> Calcular e lançar comissões
        </Button>
        <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
          <Download className="mr-2 size-4" /> Exportar folha
        </Button>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Salários base", value: totalBase },
          { label: "Comissões", value: totalComissao },
          { label: "Diárias, dobras e gratificações", value: totalGrat },
          { label: "Total líquido da folha", value: totalFolha },
        ].map((c) => (
          <Card key={c.label} className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wallet className="size-3.5" /> {c.label}
            </p>
            <p className="mt-1 text-lg font-bold">{brl(c.value)}</p>
          </Card>
        ))}
      </div>

      <Card className="divide-y divide-border">
        {rows.length === 0 && (
          <p className="p-10 text-center text-sm text-muted-foreground">
            Cadastre funcionários para montar a folha.
          </p>
        )}
        {rows.map((r) => (
          <div key={r.id} className="space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <p className="font-semibold">{r.name}</p>
                <p className="text-xs text-muted-foreground">{r.job_title}</p>
              </div>
              <div className="ml-auto flex flex-wrap items-end gap-3">
                <div className="w-36 space-y-1">
                  <Label className="text-xs">Salário base</Label>
                  <Input
                    className="h-9"
                    defaultValue={brl(r.base)}
                    inputMode="numeric"
                    onBlur={(ev) =>
                      saveBase.mutate({
                        id: r.id,
                        patch: { base_salary_cents: parseBRLToCents(ev.target.value) },
                      })
                    }
                  />
                </div>
                <div className="w-32 space-y-1">
                  <Label className="text-xs">Tipo</Label>
                  <select
                    defaultValue={r.pay_type ?? "mensal"}
                    onChange={(ev) =>
                      saveBase.mutate({ id: r.id, patch: { pay_type: ev.target.value } })
                    }
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="mensal">Mensal</option>
                    <option value="diaria">Diária</option>
                    <option value="horista">Por hora</option>
                  </select>
                </div>
                <div className="w-24 space-y-1">
                  <Label className="text-xs">Comissão %</Label>
                  <Input
                    className="h-9"
                    defaultValue={String(Number(r.commission_pct ?? 0))}
                    inputMode="decimal"
                    onBlur={(ev) =>
                      saveBase.mutate({
                        id: r.id,
                        patch: {
                          commission_pct: Number(ev.target.value.replace(",", ".")) || 0,
                        },
                      })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
              {[
                { l: "Vendas no mês", v: brl(r.vendas) },
                { l: "Comissão calculada", v: brl(r.comissaoCalculada) },
                { l: "Comissão lançada", v: brl(r.comissaoLancada) },
                { l: "Diárias e dobras", v: brl(r.diarias) },
                { l: "Gratificações", v: brl(r.gratificacoes) },
                { l: "Descontos e consumo", v: `-${brl(r.descontos)}` },
              ].map((c) => (
                <div key={c.l} className="rounded-md bg-muted/50 px-3 py-2">
                  <p className="text-muted-foreground">{c.l}</p>
                  <p className="font-semibold text-foreground">{c.v}</p>
                </div>
              ))}
            </div>

            <p className="text-right text-sm">
              Líquido a pagar:{" "}
              <strong className="text-base text-primary">{brl(r.liquido)}</strong>
            </p>
          </div>
        ))}
      </Card>
    </div>
  );
}
