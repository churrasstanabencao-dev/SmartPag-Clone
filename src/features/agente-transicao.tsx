import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileUp, Loader2, Repeat, Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import {
  parseSalesDocument,
  importParsedSales,
  type ParsedSale,
} from "@/lib/migration.functions";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PAYMENT_METHODS, methodLabel } from "@/lib/smartpag";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

export function AgenteTransicao() {
  const { storeId, store } = useStore();
  const parse = useServerFn(parseSalesDocument);
  const importFn = useServerFn(importParsedSales);
  const inputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState("");
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sales, setSales] = useState<ParsedSale[]>([]);
  const [notes, setNotes] = useState("");

  const total = sales.reduce((s, x) => s + (Number(x.amount) || 0), 0);

  async function handleFile(file: File) {
    if (file.size > 12 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx. 12 MB).");
      return;
    }
    setReading(true);
    setFileName(file.name);
    try {
      const fileBase64 = await toBase64(file);
      const res = await parse({
        data: {
          fileName: file.name,
          contentType: file.type || "application/pdf",
          fileBase64,
        },
      });
      setSales(res.sales);
      setNotes([res.source && `Origem: ${res.source}`, res.notes].filter(Boolean).join(" · "));
      if (res.sales.length === 0) toast.warning("Nenhuma venda identificada no documento.");
      else toast.success(`${res.sales.length} venda(s) identificada(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao ler o documento.");
    } finally {
      setReading(false);
    }
  }

  function update(i: number, patch: Partial<ParsedSale>) {
    setSales((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function doImport() {
    if (!storeId) {
      toast.error("Selecione uma loja.");
      return;
    }
    if (sales.length === 0) return;
    setImporting(true);
    try {
      const res = await importFn({ data: { storeId, sales } });
      toast.success(`${res.imported} venda(s) importada(s) · ${brl(res.totalCents / 100)}`);
      setSales([]);
      setFileName("");
      setNotes("");
      if (inputRef.current) inputRef.current.value = "";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao importar.");
    } finally {
      setImporting(false);
    }
  }

  function exportCsv() {
    const csv = [
      "data;descricao;forma;valor",
      ...sales.map((s) => `${s.date};${s.description};${s.method};${s.amount.toFixed(2)}`),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "vendas-migracao.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-9 items-center justify-center rounded-xl bg-chart-4/15 text-chart-4">
            <Repeat className="size-[18px]" />
          </span>
          <div>
            <p className="text-sm font-semibold">Agente de Transição</p>
            <p className="text-xs text-muted-foreground">
              Importe as vendas do seu sistema antigo por PDF, cupom ou print — o agente lê e lança em{" "}
              {store?.name ?? "sua loja"}.
            </p>
          </div>
        </div>
        <Button onClick={() => inputRef.current?.click()} disabled={reading}>
          {reading ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
          {reading ? "Lendo documento..." : "Enviar PDF / imagem"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
      </div>

      {fileName && (
        <p className="text-xs text-muted-foreground">
          Arquivo: <span className="font-medium text-foreground">{fileName}</span>
          {notes ? ` · ${notes}` : ""}
        </p>
      )}

      {sales.length > 0 && (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2 text-left">Data</th>
                  <th className="p-2 text-left">Descrição</th>
                  <th className="p-2 text-left">Forma</th>
                  <th className="p-2 text-right">Valor</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {sales.map((s, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">
                      <Input
                        type="date"
                        value={s.date}
                        onChange={(e) => update(i, { date: e.target.value })}
                        className="h-8 w-[150px]"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        value={s.description}
                        onChange={(e) => update(i, { description: e.target.value })}
                        className="h-8 min-w-[180px]"
                      />
                    </td>
                    <td className="p-2">
                      <select
                        value={s.method}
                        onChange={(e) =>
                          update(i, { method: e.target.value as ParsedSale["method"] })
                        }
                        className="h-8 rounded-md border bg-background px-2 text-sm"
                      >
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m.id} value={m.id}>
                            {methodLabel(m.id)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2 text-right">
                      <Input
                        type="number"
                        step="0.01"
                        value={s.amount}
                        onChange={(e) => update(i, { amount: Number(e.target.value) })}
                        className="h-8 w-[110px] text-right"
                      />
                    </td>
                    <td className="p-2 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSales((p) => p.filter((_, idx) => idx !== i))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              {sales.length} venda(s) · total{" "}
              <span className="font-semibold">{brl(total)}</span>
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={exportCsv}>
                <Download className="size-4" /> CSV
              </Button>
              <Button onClick={doImport} disabled={importing || !storeId}>
                {importing ? <Loader2 className="size-4 animate-spin" /> : null}
                Importar para o caixa
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
