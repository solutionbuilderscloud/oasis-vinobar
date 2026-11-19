import { eq } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { cancelSale } from "@/app/actions-venda";
import { HBars } from "@/components/charts";
import { Flash } from "@/components/ui";
import { db } from "@/db";
import { customers, saleItems, sales, users, wines } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { addDays, formatDay, isDayKey, todayKey } from "@/lib/dates";
import { usd } from "@/lib/money";
import { formatIn } from "@/lib/sale-math";

const sum = <T,>(list: T[], f: (x: T) => number) => list.reduce((s, x) => s + f(x), 0);
const hour = (d: Date) => d.toLocaleTimeString("pt-BR", { timeZone: "America/Asuncion", hour: "2-digit", minute: "2-digit" });

// lê a URL a cada acesso; navegação resolve no servidor
export const instant = false;

export default async function Vendas({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser("admin", "gerente");
  await connection();
  const sp = await searchParams;
  const today = todayKey();
  const day = isDayKey(sp.dia) && sp.dia <= today ? sp.dia : today;
  const [rows, items] = await Promise.all([
    db.select({ s: sales, seller: users.name, customer: customers.name }).from(sales)
      .leftJoin(users, eq(users.id, sales.userId)).leftJoin(customers, eq(customers.id, sales.customerId))
      .where(eq(sales.day, day)).orderBy(sales.id),
    db.select({ i: saleItems, wine: wines.name, vintage: wines.vintage }).from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId)).innerJoin(wines, eq(wines.id, saleItems.wineId)).where(eq(sales.day, day)),
  ]);
  // bonificação e permuta aparecem na lista, mas não entram nos totais de venda
  const ok = rows.filter((r) => r.s.status === "concluida" && r.s.kind === "venda");
  const total = sum(ok, (r) => r.s.totalCents);
  const bottles = sum(items.filter((i) => ok.some((r) => r.s.id === i.i.saleId)), (i) => i.i.qty);
  const cost = sum(items.filter((i) => ok.some((r) => r.s.id === i.i.saleId)), (i) => i.i.qty * i.i.costCents);
  const group = (key: (r: (typeof ok)[number]) => string) => {
    const m = new Map<string, { name: string; value: number; n: number }>();
    for (const r of ok) { const g = m.get(key(r)) ?? { name: key(r), value: 0, n: 0 }; g.value += r.s.totalCents; g.n += 1; m.set(key(r), g); }
    return [...m.values()].sort((a, b) => b.value - a.value).map((g) => ({ name: g.name, value: g.value, text: `${g.n} · ${usd(g.value)}` }));
  };
  // o que deve estar na gaveta: dinheiro recebido, separado por moeda
  const drawer = ["USD", "PYG", "BRL"].map((c) => ({ c, cents: sum(ok.filter((r) => r.s.method === "dinheiro" && r.s.currency === c), (r) => r.s.paidCents) })).filter((d) => d.cents > 0);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <p className="text-sm text-muted">Vendas e fechamento de caixa</p>
          <h1 className="text-2xl font-semibold tracking-tight first-letter:uppercase">{formatDay(day, { weekday: "long", day: "numeric", month: "long" })}</h1>
        </div>
        <Link className="btn-ghost" href={`/vendas?dia=${addDays(day, -1)}`}>← Dia anterior</Link>
        {day < today ? <Link className="btn-ghost" href={`/vendas?dia=${addDays(day, 1)}`}>Dia seguinte →</Link> : <span className="btn-ghost pointer-events-none opacity-40" aria-disabled="true">Dia seguinte →</span>}
        <Link className="btn" href="/caixa">Abrir caixa</Link>
      </div>
      <Flash sp={sp} />

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="grid gap-3 sm:grid-cols-2 xl:col-span-12 xl:grid-cols-4">
          <div className="card lift"><p className="text-sm text-muted">Vendido no dia</p><p className="num mt-1 text-4xl text-gold">{usd(total)}</p><p className="text-xs text-muted">lucro bruto {usd(total - cost)}</p></div>
          <div className="card lift"><p className="text-sm text-muted">Vendas</p><p className="num mt-1 text-4xl">{ok.length}</p><p className="text-xs text-muted">{rows.filter((r) => r.s.status === "cancelada").length} estornadas · {rows.filter((r) => r.s.kind !== "venda" && r.s.status === "concluida").length} bonificações ou permutas</p></div>
          <div className="card lift"><p className="text-sm text-muted">Ticket médio</p><p className="num mt-1 text-4xl">{usd(ok.length ? Math.round(total / ok.length) : 0)}</p><p className="text-xs text-muted">{bottles} garrafas · {ok.length ? (bottles / ok.length).toFixed(1) : 0} por venda</p></div>
          <div className="card lift"><p className="text-sm text-muted">Turistas sem IVA</p><p className="num mt-1 text-4xl">{ok.filter((r) => r.s.tourist).length}</p><p className="text-xs text-muted">{usd(sum(ok.filter((r) => r.s.tourist), (r) => r.s.totalCents))} · IVA das demais {usd(sum(ok, (r) => r.s.taxCents))}</p></div>
        </div>

        {ok.length > 0 && (
          <>
            <section className="card lift xl:col-span-3">
              <h2 className="font-semibold tracking-tight">Dinheiro na gaveta</h2>
              <p className="mb-4 text-xs text-muted">Recebido em espécie, por moeda. Confira ao fechar.</p>
              {drawer.length === 0 ? <p className="text-sm text-muted">Nenhuma venda em dinheiro.</p> : (
                <ul className="space-y-2">{drawer.map((d) => <li key={d.c} className="tile !p-3"><span className="text-xs text-muted">{d.c}</span><span className="num block text-2xl">{formatIn(d.cents, d.c as "USD")}</span></li>)}</ul>
              )}
            </section>
            <section className="card lift xl:col-span-3"><h2 className="mb-4 font-semibold tracking-tight">Por forma de pagamento</h2><HBars tone="gold" rows={group((r) => r.s.method[0].toUpperCase() + r.s.method.slice(1))} /></section>
            <section className="card lift xl:col-span-3"><h2 className="mb-4 font-semibold tracking-tight">Por caixa</h2><HBars rows={group((r) => `Caixa ${r.s.register}`)} /></section>
            <section className="card lift xl:col-span-3"><h2 className="mb-4 font-semibold tracking-tight">Por vendedor</h2><HBars tone="wine" rows={group((r) => r.seller ?? "Sem vendedor")} /></section>
          </>
        )}

        <section className="card xl:col-span-12">
          <h2 className="mb-3 font-semibold tracking-tight">Vendas do dia</h2>
          {rows.length === 0 ? <p className="text-sm text-muted">Nenhuma venda registrada neste dia. As vendas feitas no Caixa aparecem aqui na hora.</p> : (
            <ul className="space-y-2">
              {[...rows].reverse().map(({ s, seller, customer }) => (
                <li key={s.id}>
                  <details className={`tile !p-0 ${s.status === "cancelada" ? "opacity-50" : ""}`}>
                    <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 p-4 text-sm">
                      <span className="num w-14">nº {s.id}</span>
                      <span className="text-muted">{hour(s.createdAt)} · Caixa {s.register}</span>
                      <span className="min-w-0 flex-1 truncate">{customer ?? "Sem cadastro"}<span className="text-muted"> · {seller ?? "—"}</span></span>
                      {s.tourist && <span className="badge-gold">Turista</span>}
                      {s.kind !== "venda" && <span className="badge-wine capitalize">{s.kind}</span>}
                      {s.status === "cancelada" && <span className="badge">Estornada</span>}
                      {s.kind === "venda" && <span className="badge capitalize">{s.method}</span>}
                      <span className="w-32 text-right"><b className="num">{usd(s.kind === "venda" ? s.totalCents : s.subtotalCents)}</b>{s.kind !== "venda" && <span className="block text-xs text-muted">sem cobrança</span>}{s.currency !== "USD" && <span className="block text-xs text-muted">{formatIn(s.paidCents, s.currency)}</span>}</span>
                    </summary>
                    <div className="border-t border-line p-4 text-sm">
                      <ul className="space-y-1">
                        {items.filter((i) => i.i.saleId === s.id).map((i) => (
                          <li key={i.i.id} className="flex justify-between gap-3"><span>{i.i.qty} × <Link className="hover:underline" href={`/estoque/${i.i.wineId}`}>{i.wine} {i.vintage ?? ""}</Link></span><span className="tabular-nums">{usd(i.i.qty * i.i.priceCents)}</span></li>
                        ))}
                      </ul>
                      {s.note && <p className="mt-2 text-xs">Motivo: {s.note}</p>}
                      <p className="mt-2 text-xs text-muted">Subtotal {usd(s.subtotalCents)}{s.discountCents > 0 && ` · desconto ${usd(s.discountCents)}`}{s.tourist ? " · sem IVA" : ` · IVA incluso ${usd(s.taxCents)}`}</p>
                      {s.status === "concluida" && (
                        <form action={cancelSale} className="mt-3"><input type="hidden" name="id" value={s.id} /><input type="hidden" name="dia" value={day} />
                          <button className="btn-ghost">Estornar venda e devolver ao estoque</button>
                        </form>
                      )}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
