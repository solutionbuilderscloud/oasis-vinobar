import { and, desc, eq, ne } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "@/db";
import { customers, saleItems, sales, users, wines } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDay, todayKey } from "@/lib/dates";
import { usd } from "@/lib/money";

const sum = <T,>(list: T[], f: (x: T) => number) => list.reduce((s, x) => s + f(x), 0);

// dados do momento; navegação resolve no servidor
export const instant = false;

export default async function Permutas() {
  await requireUser("admin", "gerente");
  await connection();
  const boss = alias(users, "boss");
  const [rows, items, partners] = await Promise.all([
    db.select({ s: sales, customer: customers.name, seller: users.name, boss: boss.name }).from(sales)
      .leftJoin(customers, eq(customers.id, sales.customerId)).leftJoin(users, eq(users.id, sales.userId)).leftJoin(boss, eq(boss.id, sales.authorizedBy))
      .where(and(ne(sales.kind, "venda"), eq(sales.status, "concluida"))).orderBy(desc(sales.id)),
    db.select({ i: saleItems, wine: wines.name }).from(saleItems).innerJoin(sales, eq(sales.id, saleItems.saleId)).innerJoin(wines, eq(wines.id, saleItems.wineId))
      .where(ne(sales.kind, "venda")),
    db.select().from(customers),
  ]);
  const cost = (saleId: number) => sum(items.filter((i) => i.i.saleId === saleId), (i) => i.i.qty * i.i.costCents);
  const month = todayKey().slice(0, 7);
  const of = (kind: string, onlyMonth = false) => rows.filter((r) => r.s.kind === kind && (!onlyMonth || r.s.day.startsWith(month)));
  // permuta consome o crédito combinado pelo valor de prateleira
  const accounts = partners
    .map((c) => ({ ...c, taken: sum(of("permuta").filter((r) => r.s.customerId === c.id), (r) => r.s.subtotalCents), n: of("permuta").filter((r) => r.s.customerId === c.id).length }))
    .filter((c) => c.barterLimitCents > 0 || c.taken > 0).sort((a, b) => b.taken - a.taken);

  return (
    <>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Bonificações e permutas</h1>
        <p className="text-sm text-muted">Garrafas que saíram pelo caixa sem cobrança. Cada uma tem motivo, quem levou e quem liberou com a senha.</p>
      </div>
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="grid gap-3 sm:grid-cols-2 xl:col-span-12 xl:grid-cols-4">
          <div className="card lift"><p className="text-sm text-muted">Bonificado neste mês</p><p className="num mt-1 text-4xl">{usd(sum(of("bonificação", true), (r) => cost(r.s.id)))}</p><p className="text-xs text-muted">a custo · {of("bonificação", true).length} saídas</p></div>
          <div className="card lift"><p className="text-sm text-muted">Permutas neste mês</p><p className="num mt-1 text-4xl">{usd(sum(of("permuta", true), (r) => r.s.subtotalCents))}</p><p className="text-xs text-muted">a preço de prateleira · custo {usd(sum(of("permuta", true), (r) => cost(r.s.id)))}</p></div>
          <div className="card lift"><p className="text-sm text-muted">Crédito de permuta em aberto</p><p className="num mt-1 text-4xl text-gold">{usd(sum(accounts, (a) => Math.max(0, a.barterLimitCents - a.taken)))}</p><p className="text-xs text-muted">ainda podem retirar</p></div>
          <div className="card lift"><p className="text-sm text-muted">Acima do combinado</p><p className="num mt-1 text-4xl">{accounts.filter((a) => a.barterLimitCents > 0 && a.taken > a.barterLimitCents).length}</p><p className="text-xs text-muted">parceiros que já passaram do crédito</p></div>
        </div>

        <section className="card xl:col-span-5">
          <h2 className="font-semibold tracking-tight">Contas de permuta</h2>
          <p className="mb-4 text-xs text-muted">O crédito combinado é definido no cadastro do cliente.</p>
          {accounts.length === 0 ? <p className="text-sm text-muted">Nenhuma permuta ainda. Defina um crédito em <Link className="underline underline-offset-2" href="/clientes">Clientes</Link> e registre a retirada no Caixa.</p> : (
            <ul className="space-y-3">
              {accounts.map((a) => {
                const left = a.barterLimitCents - a.taken, over = a.barterLimitCents > 0 && left < 0;
                return (
                  <li key={a.id} className="tile">
                    <div className="flex items-baseline justify-between gap-3"><Link href={`/clientes?editar=${a.id}`} className="truncate font-medium hover:underline">{a.name}</Link><span className={`num shrink-0 ${over ? "" : "text-gold"}`}>{a.barterLimitCents ? (over ? `passou ${usd(-left)}` : `saldo ${usd(left)}`) : "sem crédito definido"}</span></div>
                    <div className="mt-2 h-1.5 rounded-full bg-fg/10"><div className={`grow-x h-full rounded-full ${over ? "bg-wine" : "bg-gradient-to-r from-gold/30 to-gold"}`} style={{ width: `${a.barterLimitCents ? Math.min(100, (a.taken / a.barterLimitCents) * 100) : 100}%` }} /></div>
                    <p className="mt-1 text-xs text-muted">retirou {usd(a.taken)} em {a.n} {a.n === 1 ? "vez" : "vezes"}{a.barterLimitCents > 0 && ` de ${usd(a.barterLimitCents)} combinados`}{a.notes && ` · ${a.notes}`}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card xl:col-span-7">
          <h2 className="mb-3 font-semibold tracking-tight">Saídas sem cobrança</h2>
          {rows.length === 0 ? <p className="text-sm text-muted">Nenhuma bonificação ou permuta registrada.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr><th className="th">Dia</th><th className="th">Tipo</th><th className="th">Quem levou e por quê</th><th className="th text-right">Prateleira</th><th className="th text-right">Custo</th><th className="th">Liberou</th></tr></thead>
                <tbody>
                  {rows.slice(0, 60).map(({ s, customer, seller, boss }) => (
                    <tr key={s.id}>
                      <td className="td whitespace-nowrap text-sm text-muted">{formatDay(s.day, { day: "numeric", month: "short" })}</td>
                      <td className="td"><span className={`${s.kind === "permuta" ? "badge-gold" : "badge-wine"} capitalize`}>{s.kind}</span></td>
                      <td className="td"><span className="font-medium">{customer ?? "Sem cadastro"}</span><span className="block text-xs text-muted">{s.note}</span><span className="block text-xs text-muted">{items.filter((i) => i.i.saleId === s.id).map((i) => `${i.i.qty} × ${i.wine}`).join(", ")}</span></td>
                      <td className="td num text-right">{usd(s.subtotalCents)}</td>
                      <td className="td text-right tabular-nums text-muted">{usd(cost(s.id))}</td>
                      <td className="td text-sm">{boss ?? "—"}<span className="block text-xs text-muted">caixa: {seller ?? "—"}</span></td>
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
