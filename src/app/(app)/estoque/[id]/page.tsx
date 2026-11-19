import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { moveStock } from "@/app/actions";
import { Flash } from "@/components/ui";
import { WineForm } from "@/components/wine-form";
import { db } from "@/db";
import { stockMovements, users, wines } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getRegions } from "@/lib/data";

const TYPE_LABEL = { "bonificação": "Bonificação (caixa)", permuta: "Permuta (caixa)", entrada: "Entrada (compra)", saida: "Saída (venda)", perda: "Perda, quebra ou degustação", ajuste: "Ajuste (contagem)", evento: "Evento" };

// lê a URL a cada acesso; navegação resolve no servidor
export const instant = false;

export default async function Vinho({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const id = Number((await params).id);
  const [wine] = Number.isInteger(id) ? await db.select().from(wines).where(eq(wines.id, id)) : [];
  if (!wine) notFound();
  const [history, regionList] = await Promise.all([
    db.select({ m: stockMovements, user: users.name }).from(stockMovements).leftJoin(users, eq(users.id, stockMovements.userId))
      .where(eq(stockMovements.wineId, id)).orderBy(desc(stockMovements.id)).limit(50),
    getRegions(),
  ]);
  const canEdit = user.role !== "caixa";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-semibold">{wine.name} {wine.vintage ?? ""}</h1>
        <span className="text-sm text-muted">Item nº {wine.itemNumber}</span>
      </div>
      <Flash sp={await searchParams} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card-wine">
          <p className="text-xs opacity-80">Em estoque</p>
          <p className="mt-2 text-5xl font-semibold tabular-nums">{wine.stock}</p>
          <p className="mt-1 text-xs opacity-80">mínimo {wine.minStock}</p>
        </div>

        {canEdit && (
          <form action={moveStock} className="card grid gap-3 sm:grid-cols-2 lg:col-span-2">
            <input type="hidden" name="wineId" value={wine.id} />
            <div>
              <label className="label" htmlFor="mtype">Movimento</label>
              <select className="input" id="mtype" name="type">
                {Object.entries(TYPE_LABEL).filter(([v]) => !["evento", "bonificação", "permuta"].includes(v)).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="qty">Quantidade (no ajuste: total contado)</label>
              <input className="input" id="qty" name="qty" type="number" min={0} step={1} required />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="note">Observação</label>
              <input className="input" id="note" name="note" placeholder="Nota do fornecedor, quebra, degustação…" />
            </div>
            <div><button className="btn">Registrar</button></div>
          </form>
        )}

        {canEdit && <div className="lg:col-span-3"><WineForm wine={wine} regionList={regionList} showCost /></div>}

        <section className="card lg:col-span-3">
          <h2 className="mb-3 text-sm font-semibold">Histórico</h2>
          {history.length === 0 ? <p className="text-sm text-muted">Sem movimentos.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr>
                  <th className="th">Data</th><th className="th">Tipo</th><th className="th text-right">Variação</th>
                  <th className="th text-right">Saldo</th><th className="th">Quem</th><th className="th">Observação</th>
                </tr></thead>
                <tbody>
                  {history.map(({ m, user }) => (
                    <tr key={m.id}>
                      <td className="td whitespace-nowrap text-muted">{m.createdAt.toLocaleString("pt-BR", { timeZone: "America/Asuncion", dateStyle: "short", timeStyle: "short" })}</td>
                      <td className="td">{TYPE_LABEL[m.type]}</td>
                      <td className="td text-right tabular-nums">{m.delta > 0 ? "+" : ""}{m.delta}</td>
                      <td className="td text-right tabular-nums">{m.stockAfter}</td>
                      <td className="td">{user ?? "sistema"}</td>
                      <td className="td text-muted">{m.note}</td>
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
