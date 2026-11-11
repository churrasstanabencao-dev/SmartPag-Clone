import {
  addDays,
  addHours,
  addMonths,
  eachDayOfInterval,
  eachHourOfInterval,
  eachMonthOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subWeeks,
  subYears,
} from "date-fns";
import { ptBR } from "date-fns/locale";

export type Period = "dia" | "semana" | "mes" | "ano";

export const PERIODS: { id: Period; label: string }[] = [
  { id: "dia", label: "Dia" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mês" },
  { id: "ano", label: "Ano" },
];

export interface BiRange {
  start: Date;
  end: Date;
  label: string;
}

const fmt = (d: Date, p: string) => format(d, p, { locale: ptBR });

/** Intervalo do período escolhido. offset 0 = atual, -1 = anterior. */
export function getRange(period: Period, offset = 0): BiRange {
  const now = new Date();
  if (period === "dia") {
    const d = addDays(now, offset);
    return { start: startOfDay(d), end: endOfDay(d), label: fmt(d, "dd 'de' MMMM yyyy") };
  }
  if (period === "semana") {
    const d = subWeeks(now, -offset);
    const start = startOfWeek(d, { weekStartsOn: 1 });
    const end = endOfWeek(d, { weekStartsOn: 1 });
    return { start, end, label: `${fmt(start, "dd/MM")} a ${fmt(end, "dd/MM/yyyy")}` };
  }
  if (period === "mes") {
    const d = subMonths(now, -offset);
    return { start: startOfMonth(d), end: endOfMonth(d), label: fmt(d, "MMMM 'de' yyyy") };
  }
  const d = subYears(now, -offset);
  return { start: startOfYear(d), end: endOfYear(d), label: fmt(d, "yyyy") };
}

export function previousRange(period: Period, offset = 0): BiRange {
  return getRange(period, offset - 1);
}

export interface Bucket {
  key: string;
  label: string;
}

export function bucketsFor(period: Period, range: BiRange): Bucket[] {
  if (period === "dia") {
    return eachHourOfInterval({ start: range.start, end: range.end }).map((d) => ({
      key: fmt(d, "yyyy-MM-dd HH"),
      label: fmt(d, "HH'h'"),
    }));
  }
  if (period === "ano") {
    return eachMonthOfInterval({ start: range.start, end: range.end }).map((d) => ({
      key: fmt(d, "yyyy-MM"),
      label: fmt(d, "MMM"),
    }));
  }
  return eachDayOfInterval({ start: range.start, end: range.end }).map((d) => ({
    key: fmt(d, "yyyy-MM-dd"),
    label: fmt(d, period === "semana" ? "EEE dd" : "dd"),
  }));
}

export function bucketKey(date: string | Date, period: Period): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (period === "dia") return fmt(d, "yyyy-MM-dd HH");
  if (period === "ano") return fmt(d, "yyyy-MM");
  return fmt(d, "yyyy-MM-dd");
}

/** Alinha uma data do período anterior ao bucket equivalente do período atual. */
export function alignedBucketKey(date: string | Date, period: Period): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (period === "dia") return bucketKey(addHours(addDays(d, 1), 0), period);
  if (period === "semana") return bucketKey(addDays(d, 7), period);
  if (period === "mes") return bucketKey(addMonths(d, 1), period);
  return bucketKey(addMonths(d, 12), period);
}

export function iso(d: Date) {
  return d.toISOString();
}

export function isoDate(d: Date) {
  return format(d, "yyyy-MM-dd");
}

/** Variação percentual entre período atual e anterior. */
export function delta(current: number, previous: number): number | null {
  if (!previous) return current ? 100 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function sum<T>(rows: T[], pick: (r: T) => number): number {
  return rows.reduce((acc, r) => acc + (Number(pick(r)) || 0), 0);
}

export function groupSum<T>(rows: T[], key: (r: T) => string, value: (r: T) => number) {
  const map = new Map<string, number>();
  for (const r of rows) map.set(key(r), (map.get(key(r)) ?? 0) + (Number(value(r)) || 0));
  return [...map.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);
}

export const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-6))",
];

export const RANGE_HINT: Record<Period, string> = {
  dia: "comparado com ontem",
  semana: "comparado com a semana anterior",
  mes: "comparado com o mês anterior",
  ano: "comparado com o ano anterior",
};

export { subDays };

export interface SeriesPoint {
  label: string;
  atual: number;
  anterior: number;
}

/** Série comparativa entre o período atual e o anterior, bucket a bucket. */
export function compareSeries(
  period: Period,
  range: BiRange,
  current: { date: string | Date; value: number }[],
  previous: { date: string | Date; value: number }[],
): SeriesPoint[] {
  const buckets = bucketsFor(period, range);
  const cur = new Map<string, number>();
  const prev = new Map<string, number>();
  for (const r of current) {
    const k = bucketKey(r.date, period);
    cur.set(k, (cur.get(k) ?? 0) + (Number(r.value) || 0));
  }
  for (const r of previous) {
    const k = alignedBucketKey(r.date, period);
    prev.set(k, (prev.get(k) ?? 0) + (Number(r.value) || 0));
  }
  return buckets.map((b) => ({
    label: b.label,
    atual: (cur.get(b.key) ?? 0) / 100,
    anterior: (prev.get(b.key) ?? 0) / 100,
  }));
}
