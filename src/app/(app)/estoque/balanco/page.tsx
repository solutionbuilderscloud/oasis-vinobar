import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { applyCount } from "@/app/actions-gestao";
import { Flash } from "@/components/ui";
import { db } from "@/db";
import { regions, wines } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getRegions } from "@/lib/data";

// lê a URL a cada acesso; navegação resolve no servidor
export const instant = false;

export default async function Balanco({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser("admin", "gerente");
  const sp = await searchParams;
  const regionId = Number(sp.regiao) || 0;
  const [rows, regionList] = await Promise.all([
    db.select({ w: wines, region: regions.name }).from(wines).innerJoin(regions, eq(regions.id, wines.regionId))
      .where(and(eq(wines.active, true), regionId ? eq(wines.regionId, regionId) : undefined)).orderBy(regions.name, wines.name),
    getRegions(),
  ]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold tracking-tight">Balanço</h1>
          <p className="max-w-2xl text-sm text-muted">Conte as garrafas na prateleira e digite o total de cada rótulo. Deixe em branco o que não contou. Ao salvar, o sistema ajusta só o que estiver diferente e registra quem fez.</p>
        </div>
        <Link className="btn-ghost" href="/estoque">Voltar ao estoque</Link>
      </div>
      <Flash sp={sp} />

      <nav aria-label="Região" className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <Link href="/estoque/balanco" className={`shrink-0 ${regionId ? "btn-ghost" : "btn"}`}>Todas</Link>
        {regionList.map((r) => <Link key={r.id} href={`/estoque/balanco?regiao=${r.id}`} className={`shrink-0 ${regionId === r.id ? "btn" : "btn-ghost"}`}>{r.name}</Link>)}
      </nav>

      <form action={applyCount} className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr><th className="th">Nº</th><th className="th">Vinho</th><th className="th">Região</th><th className="th text-right">No sistema</th><th className="th text-right">Contado</th></tr></thead>
            <tbody>
              {rows.map(({ w, region }) => (
                <tr key={w.id}>
                  <td className="td tabular-nums text-muted">{w.itemNumber}</td>
                  <td className="td"><label htmlFor={`c_${w.id}`} className="font-medium">{w.name} {w.vintage ?? ""}</label><span className="block text-xs text-muted">{w.producer}</span></td>
                  <td className="td">{region}</td>
                  <td className="td text-right tabular-nums">{w.stock}</td>
                  <td className="td text-right"><input className="input ml-auto w-24 text-right" id={`c_${w.id}`} name={`c_${w.id}`} type="number" min={0} step={1} inputMode="numeric" placeholder="—" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="sticky bottom-4 mt-4 flex justify-end"><button className="btn shadow-xl">Salvar contagem</button></div>
      </form>
    </>
  );
}
