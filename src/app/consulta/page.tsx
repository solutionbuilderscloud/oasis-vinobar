import { and, eq, like, ne, or } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { WinePhoto } from "@/components/bottle";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/ui";
import { db } from "@/db";
import { regions, wines } from "@/db/schema";
import { getRates } from "@/lib/data";
import { brl, pyg, usd } from "@/lib/money";
import { regionMeta } from "@/lib/wine-meta";

export const metadata: Metadata = { title: "Oasis Vinobar — consulta de preço" };

// só colunas públicas: custo nunca sai do servidor
const cols = {
  id: wines.id, itemNumber: wines.itemNumber, name: wines.name, producer: wines.producer, subregion: wines.subregion, grape: wines.grape,
  vintage: wines.vintage, type: wines.type, priceCents: wines.priceCents, stock: wines.stock, region: regions.name, regionId: wines.regionId, photo: wines.photo, photoCredit: wines.photoCredit,
};
const catalog = () => db.select(cols).from(wines).innerJoin(regions, eq(regions.id, wines.regionId));

async function Result({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection(); // preço e estoque sempre do momento
  const code = typeof (await searchParams).c === "string" ? ((await searchParams).c as string).trim().slice(0, 80) : "";
  if (!code) return <p className="mt-10 text-center text-lg text-muted">Aproxime o código de barras da garrafa do leitor.</p>;

  const rates = await getRates();
  const exact = await catalog().where(and(eq(wines.active, true), or(eq(wines.barcode, code), /^\d+$/.test(code) ? eq(wines.itemNumber, Number(code)) : undefined)));
  const hits = exact.length ? exact : await catalog().where(and(eq(wines.active, true), or(like(wines.name, `%${code}%`), like(wines.producer, `%${code}%`), like(wines.grape, `%${code}%`)))).limit(8);
  if (hits.length === 0) return <p role="alert" className="card mt-6 text-center text-lg">Não achamos “{code}”. Tente de novo ou chame um atendente.</p>;

  if (hits.length > 1) return (
    <ul className="mt-6 grid gap-3 sm:grid-cols-2">
      {hits.map((w) => (
        <li key={w.id}><Link href={`/consulta?c=${w.itemNumber}`} className="card lift flex items-center justify-between gap-3">
          <span className="min-w-0"><span className="block truncate text-lg font-medium">{w.name} {w.vintage ?? ""}</span><span className="block truncate text-sm text-muted">{w.producer} · {w.region}</span></span>
          <span className="num shrink-0 text-xl">{usd(w.priceCents)}</span>
        </Link></li>
      ))}
    </ul>
  );

  const w = hits[0];
  const more = await catalog().where(and(eq(wines.active, true), eq(wines.regionId, w.regionId), ne(wines.id, w.id))).orderBy(wines.priceCents).limit(4);
  return (
    <>
      <article className="card mt-6 flex flex-col items-center gap-8 sm:flex-row sm:p-10">
        <figure className="shrink-0 text-center"><WinePhoto wine={w} className="h-72" />{w.photo && w.photoCredit && <figcaption className="mt-1 max-w-48 text-[10px] text-muted">Foto: {w.photoCredit}</figcaption>}</figure>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-sm uppercase tracking-[0.25em] text-muted">{w.region}{w.subregion && ` · ${w.subregion}`}</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">{w.name} {w.vintage ?? ""}</h1>
          <p className="mt-2 text-lg text-muted">{[w.producer, w.grape, w.type].filter(Boolean).join(" · ")}</p>
          <p className="num mt-6 text-7xl text-gold">{usd(w.priceCents)}</p>
          <p className="mt-2 text-2xl tabular-nums">{brl(w.priceCents, rates)} <span className="text-muted">·</span> {pyg(w.priceCents, rates)}</p>
          <p className="mt-5"><span className={w.stock > 0 ? "badge-gold" : "badge"}>{w.stock > 0 ? `Disponível · ${w.stock} ${w.stock === 1 ? "garrafa" : "garrafas"}` : "Esgotado no momento"}</span></p>
          {regionMeta(w.region)?.blurb && <p className="mt-5 text-sm text-muted">{regionMeta(w.region)!.blurb}</p>}
        </div>
      </article>
      {more.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-lg font-semibold tracking-tight">Outros de {w.region}</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {more.map((m) => (
              <li key={m.id}><Link href={`/consulta?c=${m.itemNumber}`} className="card lift block">
                <span className="block truncate font-medium">{m.name} {m.vintage ?? ""}</span><span className="block truncate text-xs text-muted">{m.producer}</span>
                <span className="num mt-2 block text-xl">{usd(m.priceCents)}</span>
              </Link></li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

export default function Consulta({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-8">
      <header className="mb-6 flex items-center justify-between gap-4"><Link href="/consulta" aria-label="Oasis Vinobar, nova consulta"><Logo /></Link><ThemeToggle /></header>
      {/* o leitor digita o código e manda Enter: o formulário envia sozinho, e o campo volta com foco para a próxima garrafa */}
      <form action="/consulta" className="card flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label className="label" htmlFor="c">Consulte o preço: bipe a garrafa ou digite o nome</label>
          <input className="input !py-4 text-xl" id="c" name="c" autoFocus autoComplete="off" placeholder="Bipe o código de barras" required />
        </div>
        <button className="btn !py-4 text-base">Consultar</button>
      </form>
      <Suspense fallback={<p className="mt-10 text-center text-sm text-muted">Procurando…</p>}><Result searchParams={searchParams} /></Suspense>
    </main>
  );
}
