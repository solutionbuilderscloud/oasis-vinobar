import Link from "next/link";
import { connection } from "next/server";
import { deleteSupplier, saveSupplier } from "@/app/actions-venda";
import { Flash } from "@/components/ui";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { requireUser } from "@/lib/auth";

// lê a URL a cada acesso; navegação resolve no servidor
export const instant = false;

export default async function Fornecedores({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser("admin", "gerente");
  await connection();
  const sp = await searchParams;
  const list = await db.select().from(suppliers).orderBy(suppliers.name);
  const editing = list.find((s) => String(s.id) === sp.editar);

  return (
    <>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Fornecedores</h1>
        <p className="text-sm text-muted">Importadores e vinícolas de quem a loja compra, com contato e prazo de entrega.</p>
      </div>
      <Flash sp={sp} />
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-8">
          {list.length === 0 ? <p className="card text-sm text-muted">Nenhum fornecedor cadastrado. Cadastre o primeiro ao lado.</p> : (
            <div className="grid gap-4 sm:grid-cols-2">
              {list.map((s) => (
                <article key={s.id} className="card lift">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><h2 className="truncate text-lg font-semibold tracking-tight">{s.name}</h2><p className="text-xs text-muted">{s.country || "País não informado"}</p></div>
                    <span className="tile shrink-0 !p-2 text-center leading-none"><span className="num block text-2xl">{s.leadDays}</span><span className="text-[10px] uppercase tracking-widest text-muted">dias</span></span>
                  </div>
                  <dl className="mt-3 space-y-1 text-sm">
                    <div className="flex gap-2"><dt className="w-16 shrink-0 text-muted">Contato</dt><dd className="truncate">{s.contact || "—"}</dd></div>
                    <div className="flex gap-2"><dt className="w-16 shrink-0 text-muted">Telefone</dt><dd className="truncate">{s.phone ? <a className="hover:underline" href={`tel:${s.phone}`}>{s.phone}</a> : "—"}</dd></div>
                    <div className="flex gap-2"><dt className="w-16 shrink-0 text-muted">E-mail</dt><dd className="truncate">{s.email ? <a className="hover:underline" href={`mailto:${s.email}`}>{s.email}</a> : "—"}</dd></div>
                  </dl>
                  {s.notes && <p className="mt-2 text-xs text-muted">{s.notes}</p>}
                  <div className="mt-4 flex gap-2">
                    <Link className="btn-ghost flex-1" href={`/fornecedores?editar=${s.id}`}>Editar</Link>
                    <form action={deleteSupplier}><input type="hidden" name="id" value={s.id} /><button className="btn-ghost" aria-label={`Remover ${s.name}`}>Remover</button></form>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <form key={editing?.id ?? "novo"} action={saveSupplier} className="card space-y-3 self-start xl:col-span-4">
          <h2 className="font-semibold tracking-tight">{editing ? `Editar ${editing.name}` : "Novo fornecedor"}</h2>
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div><label className="label" htmlFor="name">Nome</label><input className="input" id="name" name="name" defaultValue={editing?.name} required /></div>
          <div className="flex gap-2">
            <div className="flex-1"><label className="label" htmlFor="country">País</label><input className="input" id="country" name="country" defaultValue={editing?.country} /></div>
            <div><label className="label" htmlFor="leadDays">Entrega (dias)</label><input className="input w-28" id="leadDays" name="leadDays" type="number" min={0} max={365} defaultValue={editing?.leadDays ?? 14} /></div>
          </div>
          <div><label className="label" htmlFor="contact">Pessoa de contato</label><input className="input" id="contact" name="contact" defaultValue={editing?.contact} /></div>
          <div><label className="label" htmlFor="phone">Telefone ou WhatsApp</label><input className="input" id="phone" name="phone" type="tel" defaultValue={editing?.phone} /></div>
          <div><label className="label" htmlFor="email">E-mail</label><input className="input" id="email" name="email" type="email" defaultValue={editing?.email} /></div>
          <div><label className="label" htmlFor="notes">Observações</label><input className="input" id="notes" name="notes" defaultValue={editing?.notes} placeholder="Pedido mínimo, condição de pagamento…" /></div>
          <button className="btn w-full">{editing ? "Salvar" : "Cadastrar fornecedor"}</button>
          {editing && <Link className="btn-ghost w-full" href="/fornecedores">Cancelar edição</Link>}
        </form>
      </div>
    </>
  );
}
