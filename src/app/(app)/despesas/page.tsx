import { and, desc, gte, lte } from "drizzle-orm";
import { connection } from "next/server";
import { addExpense, deleteExpense } from "@/app/actions-gestao";
import { DayBars, DonutArc, HBars } from "@/components/charts";
import { MonthNav } from "@/components/month-nav";
import { Flash } from "@/components/ui";
import { db } from "@/db";
import { CURRENCIES, EXPENSE_CATEGORIES, expenses } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { addMonths, formatDay, isMonthKey, monthDays, todayKey } from "@/lib/dates";
import { usd } from "@/lib/money";

const COLORS = ["var(--gold)", "var(--wine)", "#7fb7be", "#e08e79", "#9aa79b", "#c9b6e4", "#d9a05b", "#8f8f9c"];
const SYMBOL = { USD: "US$", PYG: "₲", BRL: "R$" };
const pct = (part: number, total: number) => (total ? (part / total) * 100 : 0);

// lê a URL a cada acesso; navegação resolve no servidor
export const instant = false;

export default async function Despesas({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser("admin", "gerente");
  await connection();
  const sp = await searchParams;
  const today = todayKey();
  const month = isMonthKey(sp.mes) && sp.mes <= today.slice(0, 7) ? sp.mes : today.slice(0, 7);
  const prev = addMonths(month, -1);
  const rows = await db.select().from(expenses).where(and(gte(expenses.day, `${prev}-01`), lte(expenses.day, `${month}-31`))).orderBy(desc(expenses.day), desc(expenses.id));
  const list = rows.filter((e) => e.day.startsWith(month));
  const total = list.reduce((s, e) => s + e.usdCents, 0);
  const prevTotal = rows.filter((e) => e.day.startsWith(prev)).reduce((s, e) => s + e.usdCents, 0);
  const byCategory = EXPENSE_CATEGORIES.map((c, i) => ({ name: c, color: COLORS[i], value: list.filter((e) => e.category === c).reduce((s, e) => s + e.usdCents, 0) }))
    .filter((c) => c.value > 0).sort((a, b) => b.value - a.value);
  const days = monthDays(month);
  const elapsed = month === today.slice(0, 7) ? Number(today.slice(8)) : days.length;
  const change = prevTotal ? pct(total - prevTotal, prevTotal) : null;

  return (
    <>
      <MonthNav base="/despesas" month={month} title="Despesas" />
      <Flash sp={sp} />
      <div className="grid gap-4 xl:grid-cols-12">
        <section className="card lift xl:col-span-8">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="tile">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-muted">Total do mês</p>
                {change !== null && <span className="badge-gold">{change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(0)}% vs mês anterior</span>}
              </div>
              <p className="num mt-1 text-4xl">{usd(total)}</p>
              <p className="text-xs text-muted">mês anterior {usd(prevTotal)}</p>
            </div>
            <div className="tile">
              <p className="text-sm text-muted">Média por dia</p>
              <p className="num mt-1 text-4xl">{usd(Math.round(total / elapsed))}</p>
              <p className="text-xs text-muted">em {elapsed} dias</p>
            </div>
            <div className="tile">
              <p className="text-sm text-muted">Maior categoria</p>
              <p className="num mt-1 truncate text-4xl capitalize">{byCategory[0]?.name ?? "—"}</p>
              <p className="text-xs text-muted">{byCategory[0] ? `${usd(byCategory[0].value)} · ${pct(byCategory[0].value, total).toFixed(0)}% do total` : "nenhum lançamento"}</p>
            </div>
          </div>
          <p className="mb-1 mt-5 text-xs text-muted">Despesas por dia em US$</p>
          <DayBars label="Despesas por dia" days={days.map((key) => {
            const value = list.filter((e) => e.day === key).reduce((s, e) => s + e.usdCents, 0);
            return { key, value, label: key.slice(8), selected: key === today, title: `${formatDay(key, { day: "numeric", month: "short" })}: ${usd(value)}` };
          })} />
        </section>

        <section className="card lift xl:col-span-4">
          <h2 className="font-semibold tracking-tight">Para onde foi o dinheiro</h2>
          <p className="mb-4 text-xs text-muted">Por categoria, no mês</p>
          {byCategory.length === 0 ? <p className="text-sm text-muted">Nenhuma despesa lançada neste mês.</p> : (
            <div className="flex flex-col items-center gap-5">
              <DonutArc segments={byCategory} center={`${byCategory.length}`} caption={byCategory.length === 1 ? "categoria" : "categorias"} />
              <div className="w-full"><HBars tone="gold" rows={byCategory.map((c) => ({ name: c.name[0].toUpperCase() + c.name.slice(1), value: c.value, text: `${usd(c.value)} · ${pct(c.value, total).toFixed(0)}%` }))} /></div>
            </div>
          )}
        </section>

        <form action={addExpense} className="card lift space-y-3 xl:col-span-4">
          <h2 className="font-semibold tracking-tight">Lançar despesa</h2>
          <div><label className="label" htmlFor="day">Data</label><input className="input" id="day" name="day" type="date" max={today} defaultValue={month === today.slice(0, 7) ? today : `${month}-01`} required /></div>
          <div>
            <label className="label" htmlFor="category">Categoria</label>
            <select className="input capitalize" id="category" name="category">{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          </div>
          <div><label className="label" htmlFor="description">Descrição</label><input className="input" id="description" name="description" placeholder="Aluguel de novembro, conta da ANDE…" /></div>
          <div className="flex gap-2">
            <div className="flex-1"><label className="label" htmlFor="amount">Valor</label><input className="input" id="amount" name="amount" inputMode="decimal" required /></div>
            <div>
              <label className="label" htmlFor="currency">Moeda</label>
              <select className="input" id="currency" name="currency" defaultValue="PYG">{CURRENCIES.map((c) => <option key={c} value={c}>{SYMBOL[c]}</option>)}</select>
            </div>
          </div>
          <p className="text-[11px] text-muted">Guaranis e reais são convertidos para dólar pelo câmbio de hoje e ficam gravados assim.</p>
          <button className="btn w-full">Lançar</button>
        </form>

        <section className="card xl:col-span-8">
          <h2 className="mb-3 font-semibold tracking-tight">Lançamentos do mês</h2>
          {list.length === 0 ? <p className="text-sm text-muted">Nada lançado ainda. Use o formulário ao lado.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr><th className="th">Data</th><th className="th">Categoria</th><th className="th">Descrição</th><th className="th text-right">Pago</th><th className="th text-right">Em US$</th><th className="th" /></tr></thead>
                <tbody>
                  {list.map((e) => (
                    <tr key={e.id}>
                      <td className="td whitespace-nowrap text-muted">{formatDay(e.day, { day: "2-digit", month: "2-digit" })}</td>
                      <td className="td"><span className="badge capitalize">{e.category}</span></td>
                      <td className="td">{e.description}</td>
                      <td className="td whitespace-nowrap text-right tabular-nums text-muted">{SYMBOL[e.currency]} {(e.amountCents / 100).toLocaleString("pt-BR", { maximumFractionDigits: e.currency === "PYG" ? 0 : 2, minimumFractionDigits: e.currency === "PYG" ? 0 : 2 })}</td>
                      <td className="td num whitespace-nowrap text-right">{usd(e.usdCents)}</td>
                      <td className="td text-right">
                        <form action={deleteExpense}>
                          <input type="hidden" name="id" value={e.id} /><input type="hidden" name="mes" value={month} />
                          <button className="text-xs text-muted underline underline-offset-2 hover:text-fg" aria-label={`Excluir ${e.category} de ${usd(e.usdCents)}`}>Excluir</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
