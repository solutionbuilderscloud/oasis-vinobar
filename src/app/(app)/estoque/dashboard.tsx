import Link from "next/link";
import { Columns, DonutArc, HBars, Scatter } from "@/components/charts";
import { usd } from "@/lib/money";
import { TYPE_COLOR } from "@/lib/wine-meta";

export type StockRow = {
  id: number; name: string; producer: string; vintage: number | null; type: string; region: string; regionId: number;
  stock: number; priceCents: number; costCents: number; value: number; margin: number; sold: number;
  coverage: number | null; point: number; suggest: number; abc: "A" | "B" | "C"; state: "repor" | "zerado" | "parado" | "ok";
};

const sum = <T,>(list: T[], f: (x: T) => number) => list.reduce((s, x) => s + f(x), 0);
const pct = (part: number, total: number) => (total ? (part / total) * 100 : 0);
// cor do vinho dentro da barrica; dourado = atenção, igual ao indicador "Repor agora"
const LIQUID = { ok: "var(--wine)", repor: "var(--gold)", parado: "rgb(255 255 255 / .3)", zerado: "transparent" };
const HEAT_LABEL = { zerado: "Zerado", repor: "Repor", parado: "Sem venda", ok: "Em dia" };
const ABC_TEXT = { A: "Carro-chefe: nunca pode faltar", B: "Intermediário: manter abastecido", C: "Pouco giro: comprar com cautela" };
const COVER = [
  { name: "até 7 dias", max: 7 }, { name: "8 a 14", max: 14 }, { name: "15 a 30", max: 30 }, { name: "31 a 60", max: 60 }, { name: "mais de 60", max: Infinity },
];

/** Painel do estoque. Tudo que é clicável leva à lista já filtrada (`href`) ou à ficha do vinho. */
export function StockDashboard({ rows, costs, href, window }: {
  rows: StockRow[]; costs: boolean; href: (p: Record<string, string | undefined>) => string; window: number;
}) {
  const value = sum(rows, (w) => w.value);
  const revenue = sum(rows, (w) => w.sold * w.priceCents);
  const classes = (["A", "B", "C"] as const).map((k) => {
    const list = rows.filter((w) => w.abc === k);
    return { k, labels: list.length, value: sum(list, (w) => w.value), revenue: sum(list, (w) => w.sold * w.priceCents) };
  });
  // barricas empilhadas como na cava: as mais cheias em cima, as vazias embaixo; fileiras alternadas se encaixam
  const cellar = [...rows].sort((a, b) => b.stock - a.stock || a.name.localeCompare(b.name));
  // nível do vinho: cheia = o dobro do ponto de reposição; assim um rótulo campeão não faz os outros parecerem vazios
  const level = (w: StockRow) => (w.point ? Math.min(1, w.stock / (w.point * 2)) : Math.sign(w.stock)) * 100;
  const perRack = Math.min(14, Math.max(8, Math.ceil(Math.sqrt(rows.length * 2))));
  const racks: StockRow[][] = [];
  for (let i = 0; i < cellar.length; i += perRack - (racks.length % 2 ? 0 : 1)) racks.push(cellar.slice(i, i + perRack - (racks.length % 2)));
  const toBuy = rows.filter((w) => w.suggest > 0).sort((a, b) => (a.coverage ?? Infinity) - (b.coverage ?? Infinity));
  const cover = COVER.map((c, i) => ({ name: c.name, value: rows.filter((w) => w.coverage !== null && w.coverage <= c.max && w.coverage > (COVER[i - 1]?.max ?? -1)).length }));
  const noSale = rows.filter((w) => w.coverage === null).length;
  const group = (key: (w: StockRow) => string) => {
    const m = new Map<string, { name: string; value: number; bottles: number; regionId: number }>();
    for (const w of rows) {
      const g = m.get(key(w)) ?? { name: key(w), value: 0, bottles: 0, regionId: w.regionId };
      g.value += w.value; g.bottles += w.stock;
      m.set(key(w), g);
    }
    return [...m.values()].sort((a, b) => b.value - a.value);
  };
  const byRegion = group((w) => w.region), byType = group((w) => w.type).sort((a, b) => b.bottles - a.bottles);
  const bottles = sum(rows, (w) => w.stock);
  const slow = rows.filter((w) => w.stock > 0 && (w.coverage === null || w.coverage > 60)).sort((a, b) => b.value - a.value);
  const fast = [...rows].sort((a, b) => b.sold - a.sold).slice(0, 5);

  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <form action="/estoque" className="card flex flex-wrap items-end gap-3 xl:col-span-12">
        <input type="hidden" name="ver" value="lista" />
        <div className="min-w-56 flex-1">
          <label className="label" htmlFor="q">Achar um vinho: nome, produtor, uva, nº do item ou código de barras</label>
          <input className="input" id="q" name="q" autoFocus placeholder="Digite ou bipe o código" />
        </div>
        <button className="btn">Buscar na lista</button>
        <Link className="btn-ghost" href={href({})}>Abrir lista completa →</Link>
      </form>

      <section className="card lift xl:col-span-7">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-semibold tracking-tight">Cava</h2>
            <p className="text-xs text-muted">Uma barrica por rótulo: quem tem mais garrafas em cima, as zeradas embaixo. Abaixo da metade é hora de repor. Toque para abrir.</p>
          </div>
          <ul className="flex flex-wrap gap-x-3 text-xs text-muted">
            {(Object.keys(LIQUID) as (keyof typeof LIQUID)[]).map((k) => (
              <li key={k}><i className={`mr-1.5 inline-block size-2.5 rounded-full ${k === "zerado" ? "border border-dashed border-wine" : ""}`} style={{ background: LIQUID[k] }} />{HEAT_LABEL[k]}</li>
            ))}
          </ul>
        </div>
        <div className="mt-4">
          {racks.map((rack, r) => (
            <div key={r} className="flex justify-center" style={{ marginTop: r ? `-${(100 / perRack) * 0.11}%` : 0 }}>
              {rack.map((w) => (
                <Link key={w.id} href={`/estoque/${w.id}`} style={{ width: `${100 / perRack}%` }}
                  title={`${w.name} ${w.vintage ?? ""}: ${w.stock} garrafas, ${w.coverage === null ? "sem venda" : `${w.coverage} dias de cobertura`}`}
                  aria-label={`${w.name}: ${HEAT_LABEL[w.state]}, ${w.stock} garrafas`}
                  className="group relative p-[3px] transition-transform hover:z-10 hover:scale-125">
                  <span className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-full border-[3px] bg-[#1c1024] shadow-[inset_0_0_0_2px_rgb(0_0_0/.45),inset_0_6px_10px_rgb(255_255_255/.08)] group-hover:border-gold ${w.stock === 0 ? "border-dashed border-wine" : "border-white/25"}`}>
                    <span className="grow-y absolute inset-x-0 bottom-0" style={{ height: `${level(w)}%`, background: LIQUID[w.state] }} />
                    {/* tábuas do tampo */}
                    <span className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0_22%,rgb(0_0_0/.22)_22%_24%)]" />
                    <span className="num relative rounded-full bg-black/55 px-1.5 text-xs text-white">{w.stock}</span>
                  </span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="card lift xl:col-span-5">
        <h2 className="font-semibold tracking-tight">Curva ABC</h2>
        <p className="mb-4 text-xs text-muted">Rótulos classificados pelo que faturaram em {window} dias. Toque em uma classe para ver a lista.</p>
        <div className="space-y-3">
          {classes.map((c) => (
            <Link key={c.k} href={href({ abc: c.k })} className="tile lift group flex items-center gap-4">
              <span className={`num flex size-12 shrink-0 items-center justify-center rounded-2xl text-xl ${c.k === "A" ? "bg-gold text-inverse-fg" : c.k === "B" ? "bg-fg/15" : "bg-fg/5 text-muted"}`}>{c.k}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium group-hover:underline">{c.labels} rótulos · {pct(c.revenue, revenue).toFixed(0)}% das vendas</span>
                <span className="block text-xs text-muted">{ABC_TEXT[c.k]}</span>
                <span className="mt-2 block h-1.5 rounded-full bg-fg/10"><span className="grow-x block h-full rounded-full bg-gradient-to-r from-gold/30 to-gold" style={{ width: `${pct(c.revenue, revenue)}%` }} /></span>
              </span>
              <span className="shrink-0 text-right"><span className="num block">{usd(c.value)}</span><span className="block text-xs text-muted">em estoque</span></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="card lift xl:col-span-5">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <div>
            <h2 className="font-semibold tracking-tight">Lista de compras</h2>
            <p className="text-xs text-muted">O que pedir agora, do mais urgente ao menos</p>
          </div>
          <p className="text-right text-sm"><span className="num">{sum(toBuy, (w) => w.suggest)}</span> <span className="text-muted">garrafas</span>{costs && <span className="num block text-gold">{usd(sum(toBuy, (w) => w.suggest * w.costCents))}</span>}</p>
        </div>
        {toBuy.length === 0 ? <p className="text-sm text-muted">Nada para repor agora.</p> : (
          <ul className="space-y-3">
            {toBuy.slice(0, 6).map((w) => (
              <li key={w.id} className="flex items-center gap-3 text-sm">
                <Link href={`/estoque/${w.id}`} className="min-w-0 flex-1 hover:underline">
                  <span className="block truncate font-medium">{w.name} {w.vintage ?? ""}</span>
                  <span className="block truncate text-xs text-muted">{w.stock} em estoque · {w.coverage === null ? "sem venda recente" : `acaba em ${w.coverage} dias`}</span>
                </Link>
                <span className="badge-gold shrink-0">pedir {w.suggest}</span>
              </li>
            ))}
          </ul>
        )}
        {toBuy.length > 6 && <Link href={href({ status: "repor", ordem: "cobertura" })} className="btn-ghost mt-4 w-full">Ver os {toBuy.length} rótulos para repor →</Link>}
      </section>

      {costs ? (
        <section className="card lift xl:col-span-7">
          <h2 className="font-semibold tracking-tight">Giro × margem</h2>
          <p className="mb-2 text-xs text-muted">Cada ponto é um rótulo; tamanho = dinheiro em estoque; dourado = classe A. À direita e em cima: vende muito com boa margem. À esquerda e embaixo: candidatos a promoção ou a sair do catálogo.</p>
          <Scatter label="Vendas em 30 dias contra margem, por rótulo" xLabel={`garrafas vendidas em ${window} dias`} yLabel="margem %"
            points={rows.map((w) => ({ key: w.id, x: w.sold, y: w.margin, size: w.value, gold: w.abc === "A", href: `/estoque/${w.id}`, title: `${w.name}: ${w.sold} vendidas, ${w.margin.toFixed(0)}% de margem, ${usd(w.value)} em estoque` }))} />
        </section>
      ) : (
        <section className="card lift xl:col-span-7">
          <h2 className="font-semibold tracking-tight">Mais vendidos em {window} dias</h2>
          <ol className="mt-4 space-y-3">
            {fast.map((w, i) => (
              <li key={w.id} className="flex items-center gap-3 text-sm">
                <span className="num flex size-9 shrink-0 items-center justify-center rounded-full bg-fg/10" aria-hidden="true">{i + 1}</span>
                <Link href={`/estoque/${w.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{w.name}</Link>
                <span className="num shrink-0">{w.sold}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="card lift xl:col-span-4">
        <h2 className="font-semibold tracking-tight">Quanto tempo o estoque dura</h2>
        <p className="mb-4 text-xs text-muted">Rótulos por dias de cobertura{noSale > 0 && ` · ${noSale} sem venda no período`}</p>
        <Columns rows={cover} label="Número de rótulos por faixa de cobertura" />
      </section>

      <section className="card lift xl:col-span-4">
        <h2 className="font-semibold tracking-tight">Valor por região</h2>
        <p className="mb-4 text-xs text-muted">Toque em uma região para ver os rótulos</p>
        <HBars tone="gold" rows={byRegion.map((r) => ({ name: r.name, value: r.value, text: `${r.bottles} · ${usd(r.value)}`, href: href({ regiao: String(r.regionId) }) }))} />
      </section>

      <section className="card lift xl:col-span-4">
        <h2 className="font-semibold tracking-tight">Por tipo</h2>
        <p className="mb-4 text-xs text-muted">Toque em um tipo para ver os rótulos</p>
        <div className="flex items-center gap-5">
          <DonutArc segments={byType.map((t) => ({ name: t.name, value: t.bottles, color: TYPE_COLOR[t.name] }))} center={String(bottles)} caption="garrafas" />
          <ul className="min-w-0 flex-1 space-y-1">
            {byType.map((t) => (
              <li key={t.name}>
                <Link href={href({ tipo: t.name })} className="flex items-center justify-between rounded-lg px-2 py-1 text-sm hover:bg-fg/[0.07]">
                  <span className="flex items-center gap-2 text-xs capitalize text-muted"><i className="size-2 rounded-full" style={{ background: TYPE_COLOR[t.name] }} />{t.name}</span>
                  <span className="num">{pct(t.bottles, bottles).toFixed(0)}%</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="tile mt-4">
          <p className="text-xs text-muted">Dinheiro em rótulos que duram mais de 60 dias ou não vendem</p>
          <p className="num text-2xl">{usd(sum(slow, (w) => w.value))}</p>
          <p className="text-xs text-muted">{slow.length} rótulos · {pct(sum(slow, (w) => w.value), value).toFixed(0)}% do estoque</p>
        </div>
      </section>
    </div>
  );
}
