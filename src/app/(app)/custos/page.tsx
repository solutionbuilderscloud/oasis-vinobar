import { and, eq, gte, lte, ne } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { DayBars, Gauge, HBars } from "@/components/charts";
import { MonthNav } from "@/components/month-nav";
import { db } from "@/db";
import { eventWines, events, expenses, saleItems, sales as salesTable, wines } from "@/db/schema";
import { breakEven } from "@/lib/analytics";
import { requireUser } from "@/lib/auth";
import { formatDay, isMonthKey, monthDays, todayKey } from "@/lib/dates";
import { usd } from "@/lib/money";
import { getSales } from "@/lib/sales";

const pct = (part: number, total: number) => (total ? (part / total) * 100 : 0);
const sum = <T,>(list: T[], f: (x: T) => number) => list.reduce((s, x) => s + f(x), 0);

// lê a URL a cada acesso; navegação resolve no servidor
export const instant = false;

export default async function Custos({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser("admin", "gerente");
  await connection();
  const sp = await searchParams;
  const today = todayKey();
  const month = isMonthKey(sp.mes) && sp.mes <= today.slice(0, 7) ? sp.mes : today.slice(0, 7);
  const days = monthDays(month);
  const first = days[0], last = days[days.length - 1] > today ? today : days[days.length - 1];
  const monthEnd = days[days.length - 1];

  const [sales, expenseRows, eventRows, catalog, givenRows] = await Promise.all([
    getSales(first, last),
    db.select().from(expenses).where(and(gte(expenses.day, first), lte(expenses.day, monthEnd))),
    db.select({ e: events, qty: eventWines.qty, cost: wines.costCents }).from(events)
      .leftJoin(eventWines, eq(eventWines.eventId, events.id)).leftJoin(wines, eq(wines.id, eventWines.wineId))
      .where(and(eq(events.status, "realizado"), gte(events.day, first), lte(events.day, monthEnd))),
    db.select().from(wines).where(eq(wines.active, true)),
    // garrafas que saíram pelo caixa sem cobrança
    db.select({ qty: saleItems.qty, cost: saleItems.costCents }).from(saleItems).innerJoin(salesTable, eq(salesTable.id, saleItems.saleId))
      .where(and(ne(salesTable.kind, "venda"), eq(salesTable.status, "concluida"), gte(salesTable.day, first), lte(salesTable.day, monthEnd))),
  ]);
  const given = sum(givenRows, (g) => g.qty * g.cost);

  const revenue = sum(sales, (s) => s.revenue);
  const cogs = sum(sales, (s) => s.cogs);
  const gross = revenue - cogs;
  const grossMargin = revenue ? gross / revenue : 0;
  const spent = sum(expenseRows, (e) => e.usdCents);
  const eventIds = [...new Set(eventRows.map((r) => r.e.id))];
  const eventRevenue = sum(eventIds, (id) => { const e = eventRows.find((r) => r.e.id === id)!.e; return e.ticketsSold * e.ticketCents; });
  const eventCost = sum(eventRows, (r) => (r.qty ?? 0) * (r.cost ?? 0));
  const result = gross + eventRevenue - eventCost - given - spent;
  const needed = breakEven(spent, grossMargin);
  const stockCost = sum(catalog, (w) => w.stock * w.costCents);

  const lines = [
    { name: "Vendas de vinhos", value: revenue, sign: 1 },
    { name: "Custo das garrafas vendidas", value: cogs, sign: -1 },
    { name: "Ingressos de eventos", value: eventRevenue, sign: 1 },
    { name: "Vinhos servidos em eventos", value: eventCost, sign: -1 },
    { name: "Bonificações e permutas (a custo)", value: given, sign: -1 },
    { name: "Despesas", value: spent, sign: -1 },
  ];
  const scale = Math.max(1, ...lines.map((l) => l.value));

  const group = (key: (s: (typeof sales)[number]) => string) => {
    const m = new Map<string, { name: string; revenue: number; profit: number; qty: number; wineId: number; producer: string }>();
    for (const s of sales) {
      const g = m.get(key(s)) ?? { name: key(s), revenue: 0, profit: 0, qty: 0, wineId: s.wineId, producer: s.producer };
      g.revenue += s.revenue; g.profit += s.profit; g.qty += s.qty;
      m.set(key(s), g);
    }
    return [...m.values()].sort((a, b) => b.profit - a.profit);
  };
  const byRegion = group((s) => s.region);
  const byWine = group((s) => s.wine).slice(0, 6);
  const tight = catalog.filter((w) => w.priceCents > 0).map((w) => ({ ...w, margin: pct(w.priceCents - w.costCents, w.priceCents) })).sort((a, b) => a.margin - b.margin).slice(0, 6);

  return (
    <>
      <MonthNav base="/custos" month={month} title="Custos e resultado" />
      <div className="grid gap-4 xl:grid-cols-12">
        <section className="card lift xl:col-span-7">
          <h2 className="font-semibold tracking-tight">Resultado do mês</h2>
          <p className="mb-4 text-xs text-muted">O que entrou menos o que saiu</p>
          <ul className="space-y-3">
            {lines.map((l) => (
              <li key={l.name} className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 text-sm">
                <span>{l.sign < 0 && <span className="text-muted">− </span>}{l.name}</span>
                <span className="num">{usd(l.value)}</span>
                <div className="col-span-2 mt-1.5 h-1.5 rounded-full bg-fg/10">
                  <div className={`grow-x h-full rounded-full bg-gradient-to-r ${l.sign > 0 ? "from-gold/30 to-gold" : "from-wine/40 to-wine"}`} style={{ width: `${pct(l.value, scale)}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <div className="tile mt-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm text-muted">{result >= 0 ? "Lucro do mês" : "Prejuízo do mês"}</p>
              <p className={`num text-5xl ${result >= 0 ? "text-gold" : ""}`}>{result < 0 && "− "}{usd(Math.abs(result))}</p>
            </div>
            <p className="text-right text-xs text-muted">
              lucro bruto das vendas {usd(gross)}<br />
              {(grossMargin * 100).toFixed(0)}% de margem bruta
            </p>
          </div>
        </section>

        <section className="card lift flex flex-col xl:col-span-5">
          <h2 className="font-semibold tracking-tight">Ponto de equilíbrio</h2>
          <p className="mb-4 text-xs text-muted">Quanto vender no mês para pagar as despesas</p>
          {spent === 0 ? (
            <p className="text-sm text-muted">Sem despesas lançadas neste mês, não há o que cobrir. <Link className="underline underline-offset-2" href={`/despesas?mes=${month}`}>Lançar despesas</Link></p>
          ) : needed === null ? (
            <p className="text-sm text-muted">Ainda sem vendas com margem neste mês para calcular.</p>
          ) : (
            <>
              <Gauge value={pct(revenue, needed)} caption="do necessário" />
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="tile"><p className="text-xs text-muted">Precisa vender</p><p className="num text-2xl">{usd(needed)}</p></div>
                <div className="tile"><p className="text-xs text-muted">{revenue >= needed ? "Passou em" : "Faltam"}</p><p className={`num text-2xl ${revenue >= needed ? "text-gold" : ""}`}>{usd(Math.abs(needed - revenue))}</p></div>
              </div>
              <p className="mt-3 text-xs text-muted">Conta: despesas {usd(spent)} ÷ margem bruta {(grossMargin * 100).toFixed(0)}%.</p>
            </>
          )}
          <div className="tile mt-auto"><p className="text-xs text-muted">Dinheiro investido no estoque hoje (a custo)</p><p className="num text-2xl">{usd(stockCost)}</p></div>
        </section>

        <section className="card lift xl:col-span-12">
          <h2 className="font-semibold tracking-tight">Lucro bruto por dia</h2>
          <p className="mb-1 text-xs text-muted">Vendas menos custo das garrafas, em US$. Toque em um dia para abrir no painel.</p>
          <DayBars label="Lucro bruto por dia" days={days.map((key) => {
            const value = sum(sales.filter((s) => s.key === key), (s) => s.profit);
            return { key, value, label: key.slice(8), selected: key === today, href: `/?dia=${key}`, title: `${formatDay(key, { day: "numeric", month: "short" })}: ${usd(value)}` };
          })} />
        </section>

        <section className="card lift xl:col-span-4">
          <h2 className="font-semibold tracking-tight">Lucro por região</h2>
          <p className="mb-4 text-xs text-muted">Lucro bruto e margem no mês</p>
          {byRegion.length === 0 ? <p className="text-sm text-muted">Nenhuma venda neste mês.</p> : (
            <HBars tone="gold" rows={byRegion.map((r) => ({ name: r.name, value: Math.max(0, r.profit), text: `${usd(r.profit)} · ${pct(r.profit, r.revenue).toFixed(0)}%` }))} />
          )}
        </section>

        <section className="card lift xl:col-span-4">
          <h2 className="font-semibold tracking-tight">Vinhos que mais deram lucro</h2>
          <p className="mb-4 text-xs text-muted">No mês</p>
          {byWine.length === 0 ? <p className="text-sm text-muted">Nenhuma venda neste mês.</p> : (
            <ol className="space-y-3">
              {byWine.map((w, i) => (
                <li key={w.wineId} className="flex items-center gap-3">
                  <span className={`num flex size-9 shrink-0 items-center justify-center rounded-full text-sm ${i === 0 ? "bg-gold text-inverse-fg" : "bg-fg/10"}`} aria-hidden="true">{i + 1}</span>
                  <Link href={`/estoque/${w.wineId}`} className="min-w-0 flex-1 hover:underline">
                    <span className="block truncate font-medium">{w.name}</span>
                    <span className="block truncate text-xs text-muted">{w.producer} · {w.qty} garrafas</span>
                  </Link>
                  <span className="num shrink-0">{usd(w.profit)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="card lift xl:col-span-4">
          <h2 className="font-semibold tracking-tight">Margem mais apertada</h2>
          <p className="mb-4 text-xs text-muted">Rótulos do catálogo com menor margem: candidatos a rever preço</p>
          <ul className="space-y-3">
            {tight.map((w) => (
              <li key={w.id} className="flex items-baseline justify-between gap-3 text-sm">
                <Link href={`/estoque/${w.id}`} className="min-w-0 truncate hover:underline">{w.name} <span className="text-muted">{w.producer}</span></Link>
                <span className="shrink-0 tabular-nums"><b>{w.margin.toFixed(0)}%</b><span className="text-muted"> · {usd(w.costCents)} → {usd(w.priceCents)}</span></span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
