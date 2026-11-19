import { and, eq, gt } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { WinePhoto } from "@/components/bottle";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/ui";
import { WorldMap } from "@/components/world-map";
import { db } from "@/db";
import { regions, wines } from "@/db/schema";
import { getRates } from "@/lib/data";
import { brl, pyg, usd } from "@/lib/money";
import { regionMeta } from "@/lib/wine-meta";

export const metadata: Metadata = { title: "Oasis Vinobar — vinhos por região" };

type SP = Promise<Record<string, string | string[] | undefined>>;

async function Shelf({ searchParams }: { searchParams: SP }) {
  await connection(); // preço e estoque sempre do momento do acesso
  const sp = await searchParams;
  const [rows, rates] = await Promise.all([
    // só colunas públicas: custo nunca sai do servidor
    db.select({
      id: wines.id, name: wines.name, producer: wines.producer, subregion: wines.subregion, grape: wines.grape,
      vintage: wines.vintage, type: wines.type, priceCents: wines.priceCents, stock: wines.stock, region: regions.name, photo: wines.photo, photoCredit: wines.photoCredit,
    }).from(wines).innerJoin(regions, eq(regions.id, wines.regionId))
      .where(and(eq(wines.active, true), gt(wines.stock, 0))).orderBy(wines.priceCents),
    getRates(),
  ]);

  const byRegion = new Map<string, typeof rows>();
  for (const r of rows) byRegion.set(r.region, [...(byRegion.get(r.region) ?? []), r]);
  const mapRegions = [...byRegion]
    .map(([name, list]) => ({ name, labels: list.length, bottles: list.reduce((s, w) => s + w.stock, 0) }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt"));
  const active = mapRegions.find((r) => regionMeta(r.name)?.slug === sp.regiao);
  const shown = active ? byRegion.get(active.name)! : rows;

  return (
    <>
      <section className="card mb-4 p-3 sm:p-6">
        <WorldMap regions={mapRegions} active={active && regionMeta(active.name)?.slug} />
      </section>

      <nav aria-label="Regiões" className="mb-8 flex gap-2 overflow-x-auto pb-1">
        <Link href="/vitrine" scroll={false} className={`shrink-0 ${active ? "btn-ghost" : "btn"}`}>Todas · {rows.length}</Link>
        {mapRegions.map((r) => (
          <Link key={r.name} href={`/vitrine?regiao=${regionMeta(r.name)?.slug}`} scroll={false}
            className={`shrink-0 ${active?.name === r.name ? "btn" : "btn-ghost"}`}>
            {r.name} · {r.labels}
          </Link>
        ))}
      </nav>

      <header className="mb-2">
        <h1 className="text-5xl font-semibold tracking-tight sm:text-7xl">{active?.name ?? "Toda a adega"}</h1>
        <p className="mt-3 max-w-xl text-muted">
          {active ? regionMeta(active.name)?.blurb : "Toque em uma região no mapa para ver só os vinhos de lá."}
        </p>
      </header>

      {shown.length === 0 ? (
        <p className="py-16 text-center text-muted">Nenhum vinho disponível no momento.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {shown.map((w) => (
            <li key={w.id}>
              {/* a borda inferior contínua entre os itens é a tábua da prateleira */}
              <div className="flex h-72 items-end justify-center border-b-2 border-gold/60 pb-2">
                <WinePhoto wine={w} className={w.photo ? "h-[17rem] shadow-xl" : "h-44"} />
              </div>
              <div className="px-3 pt-3">
                <h2 className="text-lg font-semibold leading-tight tracking-tight">{w.name}</h2>
                <p className="mt-1 text-xs text-muted">{[w.producer, w.grape].filter(Boolean).join(" · ")}</p>
                <p className="text-xs text-muted">{[w.subregion, active ? null : w.region].filter(Boolean).join(", ")}</p>
                <p className="mt-2 num text-lg">{usd(w.priceCents)}</p>
                <p className="text-xs tabular-nums text-muted">{brl(w.priceCents, rates)} · {pyg(w.priceCents, rates)}</p>
                {w.stock <= 2 && <p className="mt-1"><span className="badge-wine">{w.stock === 1 ? "Última garrafa" : "Últimas 2"}</span></p>}
              </div>
            </li>
          ))}
        </ul>
      )}

      <footer className="mt-16 border-t border-line py-6 text-xs text-muted">
        Preços em dólar. Câmbio de hoje: US$ 1 = R$ {rates.brl.toLocaleString("pt-BR")} = ₲ {rates.pyg.toLocaleString("pt-BR")}.
      </footer>
    </>
  );
}

export default function Vitrine({ searchParams }: { searchParams: SP }) {
  return (
    <div className="mx-auto max-w-7xl p-4">
      <header className="mb-4 flex items-center justify-between py-2">
        <Link href="/vitrine" aria-label="Oasis Vinobar"><Logo /></Link>
        <ThemeToggle />
      </header>
      <main>
        <Suspense fallback={<p className="py-24 text-center text-sm text-muted">Abrindo a adega…</p>}>
          <Shelf searchParams={searchParams} />
        </Suspense>
      </main>
      <AutoRefresh />
    </div>
  );
}
