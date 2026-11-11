import type { ReactNode } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IconTile } from "@/components/AppShell";
import { REPORT_PERIODS, downloadCSV, exportTablePDF } from "@/lib/reports";

export function ReportToolbar({
  days,
  onDays,
  title,
  onExportCSV,
  onExportPDF,
}: {
  days: string;
  onDays: (v: string) => void;
  title: string;
  onExportCSV?: () => void;
  onExportPDF?: () => void;
}) {
  return (
    <div className="card-surface flex flex-wrap items-center gap-3 p-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-black">{title}</p>
        <p className="text-xs text-muted-foreground">Dados reais da loja no período</p>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Select value={days} onValueChange={onDays}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REPORT_PERIODS.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                Últimos {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {onExportCSV && (
          <Button variant="outline" size="sm" onClick={onExportCSV}>
            <FileSpreadsheet className="mr-1 size-4" /> CSV
          </Button>
        )}
        {onExportPDF && (
          <Button variant="outline" size="sm" onClick={onExportPDF}>
            <FileText className="mr-1 size-4" /> PDF
          </Button>
        )}
      </div>
    </div>
  );
}

export function ReportStats({ items }: { items: { label: string; value: string; hint?: string }[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((c) => (
        <div key={c.label} className="card-surface p-5">
          <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
          <p className="mt-1 truncate text-2xl font-black">{c.value}</p>
          {c.hint && <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p>}
        </div>
      ))}
    </div>
  );
}

export function ReportCard({
  title,
  subtitle,
  empty,
  emptyText = "Sem dados no período.",
  children,
  height = "h-72",
}: {
  title: string;
  subtitle?: string;
  empty?: boolean;
  emptyText?: string;
  children: ReactNode;
  height?: string;
}) {
  return (
    <div className="card-surface p-5">
      <p className="font-bold">{title}</p>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      {empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className={`mt-4 ${height} w-full`}>{children}</div>
      )}
    </div>
  );
}

export function ReportList({
  icon,
  tone,
  title,
  action,
  rows,
  emptyText,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  title: string;
  action?: ReactNode;
  rows: ReactNode;
  emptyText?: string;
}) {
  return (
    <div className="card-surface">
      <div className="flex items-center gap-3 border-b border-border px-5 py-3">
        <IconTile icon={icon as never} tone={tone} />
        <h3 className="font-bold">{title}</h3>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {rows ?? <p className="p-10 text-center text-sm text-muted-foreground">{emptyText ?? "Sem dados."}</p>}
    </div>
  );
}

export function ExportButtons({
  onCSV,
  onPDF,
}: {
  onCSV: () => void;
  onPDF: () => void;
}) {
  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={onCSV}>
        <Download className="mr-1 size-3.5" /> CSV
      </Button>
      <Button variant="outline" size="sm" onClick={onPDF}>
        <Download className="mr-1 size-3.5" /> PDF
      </Button>
    </div>
  );
}

export { downloadCSV, exportTablePDF };
