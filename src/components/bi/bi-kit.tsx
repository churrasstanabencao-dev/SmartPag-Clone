import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp, Minus } from "lucide-react";
import {
  PERIODS,
  getRange,
  previousRange,
  type BiRange,
  type Period,
  RANGE_HINT,
} from "@/lib/bi";

export function useBiPeriod(initial: Period = "mes") {
  const [period, setPeriod] = useState<Period>(initial);
  const [offset, setOffset] = useState(0);
  const range = getRange(period, offset);
  const prev = previousRange(period, offset);
  return { period, setPeriod, offset, setOffset, range, prev };
}

export function BiToolbar({
  period,
  setPeriod,
  offset,
  setOffset,
  range,
  right,
}: {
  period: Period;
  setPeriod: (p: Period) => void;
  offset: number;
  setOffset: (n: number) => void;
  range: BiRange;
  right?: ReactNode;
}) {
  return (
    <div className="card-surface flex flex-wrap items-center gap-3 p-4">
      <div className="flex gap-1 rounded-xl bg-muted p-1">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              setPeriod(p.id);
              setOffset(0);
            }}
            className={
              "rounded-lg px-3 py-1.5 text-sm font-bold transition-colors " +
              (period === p.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => setOffset(offset - 1)}
          aria-label="Período anterior"
          className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="min-w-44 text-center text-sm font-semibold capitalize">
          {range.label}
        </span>
        <button
          onClick={() => setOffset(Math.min(0, offset + 1))}
          disabled={offset >= 0}
          aria-label="Próximo período"
          className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <span className="text-xs text-muted-foreground">{RANGE_HINT[period]}</span>
      {right ? <div className="ml-auto flex items-center gap-2">{right}</div> : null}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  deltaPct,
  hint,
  invert = false,
}: {
  label: string;
  value: string;
  deltaPct?: number | null;
  hint?: string | undefined;
  /** true quando crescer é ruim (ex.: despesas, perdas) */
  invert?: boolean;
}) {
  const good = deltaPct == null ? null : invert ? deltaPct <= 0 : deltaPct >= 0;
  const Icon = deltaPct == null ? Minus : deltaPct >= 0 ? TrendingUp : TrendingDown;
  return (
    <div className="card-surface space-y-1 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-2xl font-black">{value}</p>
      <div className="flex items-center gap-1 text-xs font-semibold">
        <Icon
          className={
            "size-3.5 " +
            (good == null
              ? "text-muted-foreground"
              : good
                ? "text-chart-2"
                : "text-destructive")
          }
        />
        <span
          className={
            good == null
              ? "text-muted-foreground"
              : good
                ? "text-chart-2"
                : "text-destructive"
          }
        >
          {deltaPct == null ? "sem base" : `${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(1)}%`}
        </span>
        {hint ? <span className="font-normal text-muted-foreground">· {hint}</span> : null}
      </div>
    </div>
  );
}

export function ChartCard({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`card-surface space-y-3 p-5 ${className}`}>
      <div>
        <h3 className="font-bold">{title}</h3>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function EmptyBi({ children = "Sem dados no período selecionado." }: { children?: ReactNode }) {
  return <p className="py-10 text-center text-sm text-muted-foreground">{children}</p>;
}
