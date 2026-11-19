import Link from "next/link";
import { addMonths, formatMonth, todayKey } from "@/lib/dates";

/** Cabeçalho com mês anterior / seguinte. O mês atual é o limite. */
export function MonthNav({ base, month, title, children }: { base: string; month: string; title: string; children?: React.ReactNode }) {
  const current = todayKey().slice(0, 7);
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="mr-auto">
        <p className="text-sm text-muted">{title}</p>
        <h1 className="text-2xl font-semibold tracking-tight first-letter:uppercase">{formatMonth(month)}</h1>
      </div>
      <Link className="btn-ghost" href={`${base}?mes=${addMonths(month, -1)}`}>← Mês anterior</Link>
      {month < current
        ? <Link className="btn-ghost" href={`${base}?mes=${addMonths(month, 1)}`}>Mês seguinte →</Link>
        : <span className="btn-ghost cursor-not-allowed opacity-40" aria-disabled="true">Mês seguinte →</span>}
      {month !== current && <Link className="btn" href={base}>Mês atual</Link>}
      {children}
    </div>
  );
}
