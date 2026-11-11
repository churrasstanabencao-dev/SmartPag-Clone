import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const REPORT_PERIODS = [
  { id: 7, label: "7 dias" },
  { id: 15, label: "15 dias" },
  { id: 30, label: "30 dias" },
  { id: 90, label: "90 dias" },
  { id: 180, label: "6 meses" },
  { id: 365, label: "12 meses" },
] as const;

export function periodSince(days: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  return d;
}

export function dayKeyOf(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

export function lastNDays(days: number) {
  const out: { key: string; label: string }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push({
      key: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    });
  }
  return out;
}

export function csvCell(v: unknown) {
  const s = String(v ?? "");
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCSV(filename: string, header: string[], rows: (string | number)[][]) {
  const lines = [header.map(csvCell).join(";"), ...rows.map((r) => r.map(csvCell).join(";"))];
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function exportTablePDF(title: string, subtitle: string, head: string[], body: (string | number)[][], filename: string) {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  if (subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(subtitle, 14, 22);
  }
  autoTable(doc, {
    startY: subtitle ? 26 : 20,
    head: [head],
    body: body.map((r) => r.map(String)),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [15, 23, 42] },
  });
  doc.save(filename);
}

export function pct(part: number, total: number) {
  if (!total) return "0%";
  return `${((part / total) * 100).toFixed(1).replace(".", ",")}%`;
}
