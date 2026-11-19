import { and, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { saveCustomer } from "@/app/actions-venda";
import { Flash } from "@/components/ui";
import { db } from "@/db";
import { customers, sales } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDay } from "@/lib/dates";
import { usd } from "@/lib/money";

// lê a URL a cada acesso; navegação resolve no servidor
export const instant = false;

export default async function Clientes({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  await connection();
  const sp = await searchParams;
  const list = await db.select({
    c: customers, total: sql<number>`coalesce(sum(${sales.totalCents}), 0)`, n: sql<number>`count(${sales.id})`, last: sql<string | null>`max(${sales.day})`,
  }).from(customers).leftJoin(sales, and(eq(sales.customerId, customers.id), eq(sales.status, "concluida"), eq(sales.kind, "venda")))
    .groupBy(customers.id).orderBy(sql`2 desc`, customers.name);
  const editing = list.find((r) => String(r.c.id) === sp.editar)?.c;
  const buyers = list.filter((r) => r.n > 0);

  return (
    <>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
        <p className="text-sm text-muted">Quem compra, quanto e quando. Escolha o cliente no Caixa para a venda entrar aqui.</p>
      </div>
      <Flash sp={sp} />
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-8">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="card lift"><p className="text-sm text-muted">Cadastrados</p><p className="num mt-1 text-4xl">{list.length}</p><p className="text-xs text-muted">{buyers.length} já compraram</p></div>
            <div className="card lift"><p className="text-sm text-muted">Comprado por clientes</p><p className="num mt-1 text-4xl text-gold">{usd(list.reduce((s, r) => s + r.total, 0))}</p><p className="text-xs text-muted">vendas com cliente identificado</p></div>
            <div className="card lift"><p className="text-sm text-muted">Melhor cliente</p><p className="mt-1 truncate text-2xl font-semibold tracking-tight">{buyers[0]?.c.name ?? "—"}</p><p className="text-xs text-muted">{buyers[0] ? `${usd(buyers[0].total)} em ${buyers[0].n} compras` : "sem compras ainda"}</p></div>
          </div>
          <section className="card">
            {list.length === 0 ? <p className="text-sm text-muted">Nenhum cliente cadastrado. Cadastre o primeiro ao lado.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr><th className="th">Cliente</th><th className="th">Contato</th><th className="th text-right">Compras</th><th className="th text-right">Total</th><th className="th text-right">Última</th><th className="th" /></tr></thead>
                  <tbody>
                    {list.map(({ c, total, n, last }) => (
                      <tr key={c.id}>
                        <td className="td"><span className="font-medium">{c.name}</span><span className="block text-xs text-muted">{[c.country, c.document].filter(Boolean).join(" · ") || "—"}</span></td>
                        <td className="td text-sm text-muted">{c.phone || "—"}<span className="block text-xs">{c.email}</span></td>
                        <td className="td num text-right">{n}</td>
                        <td className="td num text-right">{usd(total)}</td>
                        <td className="td text-right text-sm text-muted">{last ? formatDay(last, { day: "numeric", month: "short" }) : "—"}</td>
                        <td className="td text-right"><Link className="text-xs text-muted underline underline-offset-2 hover:text-fg" href={`/clientes?editar=${c.id}`}>Editar</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <form key={editing?.id ?? "novo"} action={saveCustomer} className="card space-y-3 self-start xl:col-span-4">
          <h2 className="font-semibold tracking-tight">{editing ? `Editar ${editing.name}` : "Novo cliente"}</h2>
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div><label className="label" htmlFor="name">Nome</label><input className="input" id="name" name="name" defaultValue={editing?.name} required /></div>
          <div className="flex gap-2">
            <div className="flex-1"><label className="label" htmlFor="country">País</label><input className="input" id="country" name="country" defaultValue={editing?.country} placeholder="Brasil, Paraguai…" /></div>
            <div className="flex-1"><label className="label" htmlFor="document">Documento</label><input className="input" id="document" name="document" defaultValue={editing?.document} placeholder="CPF, RUC, passaporte" /></div>
          </div>
          <div><label className="label" htmlFor="phone">Telefone ou WhatsApp</label><input className="input" id="phone" name="phone" type="tel" defaultValue={editing?.phone} /></div>
          <div><label className="label" htmlFor="email">E-mail</label><input className="input" id="email" name="email" type="email" defaultValue={editing?.email} /></div>
          <div><label className="label" htmlFor="notes">Preferências e observações</label><input className="input" id="notes" name="notes" defaultValue={editing?.notes} placeholder="Gosta de Malbec, compra para presente…" /></div>
          <div><label className="label" htmlFor="barterLimit">Crédito de permuta combinado (US$)</label><input className="input" id="barterLimit" name="barterLimit" inputMode="decimal" defaultValue={editing?.barterLimitCents ? (editing.barterLimitCents / 100).toFixed(2) : ""} placeholder="Deixe vazio se não há permuta" /></div>
          <button className="btn w-full">{editing ? "Salvar" : "Cadastrar cliente"}</button>
          {editing && <Link className="btn-ghost w-full" href="/clientes">Cancelar edição</Link>}
        </form>
      </div>
    </>
  );
}
