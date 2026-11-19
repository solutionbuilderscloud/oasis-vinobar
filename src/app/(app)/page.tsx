import { and, desc, eq, gte, lte } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { AutoRefresh } from "@/components/auto-refresh";
import { Columns, DayBars, DonutArc, DotGrid, Gauge, HBars, Lollipops, Sparkline } from "@/components/charts";
import { WorldMap } from "@/components/world-map";
import { db } from "@/db";
import { regions, stockMovements, users, wines } from "@/db/schema";
import { canSeeCosts, requireUser } from "@/lib/auth";
import { getRates } from "@/lib/data";
import { addDays, dayKey, diffDays, formatDay, isDayKey, keysBetween, lastDays, todayKey, utcBounds } from "@/lib/dates";
import { brl, pyg, usd } from "@/lib/money";
import { regionMeta, TYPE_COLOR } from "@/lib/wine-meta";

const DAYS = 14;
const MAX_PERIOD = 92;
const TZ = "America/Asuncion";
const sum = <T,>(list: T[], f: (x: T) => number) => list.reduce((s, x) => s + f(x), 0);
const pct = (part: number, total: number) => (total ? (part / total) * 100 : 0);
const PRICE_BANDS = [
  { name: "até US$ 20", max: 2000 }, { name: "20 a 40", max: 4000 }, { name: "40 a 80", max: 8000 },
  { name: "80 a 150", max: 15000 }, { name: "acima de 150", max: Infinity },
];

function groupBy<T>(list: T[], key: (x: T) => string, add: (x: T) => { bottles: number; value: number }) {
  const m = new Map<string, { name: string; bottles: number; labels: number; value: number }>();
  for (const x of list) {
    const g = m.get(key(x)) ?? { name: key(x), bottles: 0, labels: 0, value: 0 };
    const a = add(x);
    g.bottles += a.bottles; g.value += a.value; g.labels += 1;
    m.set(key(x), g);
  }
  return [...m.values()];
}

// números sempre do momento do acesso; navegação resolve no servidor
export const instant = false;

export default async function Painel({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  await connection();
  const sp = await searchParams;
  const costs = canSeeCosts(user);
  const today = todayKey();

  // período escolhido: ?dia= para um dia, ?de=&ate= para um intervalo; nada = hoje
  let from = today, to = today;
  if (isDayKey(sp.de) && isDayKey(sp.ate)) {
    [from, to] = sp.de <= sp.ate ? [sp.de, sp.ate] : [sp.ate, sp.de];
    if (to > today) to = today;
    if (from > to) from = to;
    if (diffDays(from, to) >= MAX_PERIOD) from = addDays(to, -(MAX_PERIOD - 1));
  } else if (isDayKey(sp.dia)) from = to = sp.dia > today ? today : sp.dia;
  const single = from === to;
  const length = diffDays(from, to) + 1;
  const regiao = typeof sp.regiao === "string" ? sp.regiao : undefined;
  const link = (p: { dia?: string; de?: string; ate?: string; regiao?: string | null }) => {
    const q = new URLSearchParams();
    const dates = "dia" in p || "de" in p ? p : single ? (from === today ? {} : { dia: from }) : { de: from, ate: to };
    for (const [k, v] of Object.entries({ ...dates, regiao: "regiao" in p ? p.regiao : regiao })) if (v) q.set(k, v);
    return q.size ? `/?${q}` : "/";
  };

  // faixa de barras: o próprio período, ou 14 dias em volta do dia escolhido
  const stripEnd = single ? (addDays(from, 6) > today ? today : addDays(from, 6)) : to;
  const stripStart = single ? addDays(stripEnd, -13) : from;
  const [lo, hi] = utcBounds(stripStart, stripEnd);
  const { since, days } = lastDays(DAYS);

  const [all, moves, soldRows, recent, rates] = await Promise.all([
    db.select({ w: wines, region: regions.name }).from(wines).innerJoin(regions, eq(regions.id, wines.regionId)).where(eq(wines.active, true)),
    db.select({ delta: stockMovements.delta, type: stockMovements.type, at: stockMovements.createdAt, price: wines.priceCents })
      .from(stockMovements).innerJoin(wines, eq(wines.id, stockMovements.wineId)).where(gte(stockMovements.createdAt, since)),
    // shortcut: venda = saída de estoque ao preço e custo atuais do vinho; quando o caixa existir, ler o preço gravado em cada venda
    db.select({
      delta: stockMovements.delta, at: stockMovements.createdAt, wineId: wines.id, wine: wines.name, producer: wines.producer,
      type: wines.type, price: wines.priceCents, cost: wines.costCents, region: regions.name,
    }).from(stockMovements).innerJoin(wines, eq(wines.id, stockMovements.wineId)).innerJoin(regions, eq(regions.id, wines.regionId))
      .where(and(eq(stockMovements.type, "saida"), gte(stockMovements.createdAt, lo), lte(stockMovements.createdAt, hi))),
    db.select({ m: stockMovements, wine: wines.name, user: users.name })
      .from(stockMovements).innerJoin(wines, eq(wines.id, stockMovements.wineId)).leftJoin(users, eq(users.id, stockMovements.userId))
      .orderBy(desc(stockMovements.createdAt)).limit(5),
    getRates(),
  ]);
  const list = all.map((r) => ({ ...r.w, region: r.region }));

  if (list.length === 0)
    return (
      <div className="card py-16 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">A adega está vazia</h1>
        <p className="mx-auto mt-3 max-w-md text-muted">Cadastre o primeiro vinho ou importe a planilha para ver o painel.</p>
        {costs && (
          <p className="mt-6 flex justify-center gap-2">
            <Link className="btn" href="/estoque/novo">Novo vinho</Link>
            <Link className="btn-ghost" href="/estoque/importar">Importar planilha</Link>
          </p>
        )}
      </div>
    );

  // ---- vendas do período ----
  const sales = soldRows.map((s) => ({ ...s, key: dayKey(s.at), qty: -s.delta, revenue: -s.delta * s.price, profit: -s.delta * (s.price - s.cost) }));
  const inRange = sales.filter((s) => s.key >= from && s.key <= to);
  const revenue = sum(inRange, (s) => s.revenue);
  const profit = sum(inRange, (s) => s.profit);
  const soldBottles = sum(inRange, (s) => s.qty);
  const sold = (key: (s: (typeof inRange)[number]) => string) => groupBy(inRange, key, (s) => ({ bottles: s.qty, value: s.revenue }));
  const soldByRegion = sold((s) => s.region).sort((a, b) => b.value - a.value);
  const soldByType = sold((s) => s.type).sort((a, b) => b.bottles - a.bottles);
  const soldWines = sold((s) => String(s.wineId)).sort((a, b) => b.bottles - a.bottles || b.value - a.value);
  const wineInfo = new Map(inRange.map((s) => [String(s.wineId), s]));
  const strip = keysBetween(stripStart, stripEnd).map((key) => {
    const day = sales.filter((s) => s.key === key);
    const value = sum(day, (s) => s.revenue);
    return {
      key, value, href: link({ dia: key }), selected: key >= from && key <= to,
      label: diffDays(stripStart, stripEnd) < 31 ? key.slice(8) : "",
      title: `${formatDay(key, { weekday: "short", day: "numeric", month: "short" })}: ${usd(value)}, ${sum(day, (s) => s.qty)} garrafas`,
    };
  });
  const periodLabel = single
    ? formatDay(from, { weekday: "long", day: "numeric", month: "long" })
    : `${formatDay(from, { day: "numeric", month: "short" })} a ${formatDay(to, { day: "numeric", month: "short", year: "numeric" })}`;
  const prevHref = single ? link({ dia: addDays(from, -1) }) : link({ de: addDays(from, -length), ate: addDays(to, -length) });
  const nextHref = to >= today ? null : single ? link({ dia: addDays(from, 1) }) : link({ de: addDays(from, length), ate: addDays(to, length) > today ? today : addDays(to, length) });
  const presets = [
    { label: "Hoje", href: link({ dia: undefined }), on: single && from === today },
    { label: "Ontem", href: link({ dia: addDays(today, -1) }), on: single && from === addDays(today, -1) },
    { label: "7 dias", href: link({ de: addDays(today, -6), ate: today }), on: !single && to === today && length === 7 },
    { label: "30 dias", href: link({ de: addDays(today, -29), ate: today }), on: !single && to === today && length === 30 },
    { label: "Este mês", href: link({ de: `${today.slice(0, 8)}01`, ate: today }), on: !single && to === today && from === `${today.slice(0, 8)}01` },
  ];

  // ---- estoque agora ----
  const bottles = sum(list, (w) => w.stock);
  const value = sum(list, (w) => w.stock * w.priceCents);
  const cost = sum(list, (w) => w.stock * w.costCents);
  const margin = pct(value - cost, value);
  const stock = (key: (w: (typeof list)[number]) => string) => groupBy(list, key, (w) => ({ bottles: w.stock, value: w.stock * w.priceCents }));
  const byRegion = stock((w) => w.region).sort((a, b) => b.value - a.value);
  const byType = stock((w) => w.type).sort((a, b) => b.bottles - a.bottles);
  const byGrape = stock((w) => w.grape || "Sem uva informada").sort((a, b) => b.bottles - a.bottles).slice(0, 6);
  const bands = PRICE_BANDS.map((b, i) => ({
    name: b.name,
    value: list.filter((w) => w.priceCents <= b.max && w.priceCents > (PRICE_BANDS[i - 1]?.max ?? -1)).length,
  }));
  const lowAll = list.filter((w) => w.stock <= w.minStock).sort((a, b) => a.stock / (a.minStock || 1) - b.stock / (b.minStock || 1));
  const top = [...list].sort((a, b) => b.stock * b.priceCents - a.stock * a.priceCents).slice(0, 5);

  // valor do estoque no fim de cada dia, voltando no tempo a partir de hoje
  const net = new Map<string, number>();
  for (const m of moves) {
    const key = dayKey(m.at);
    net.set(key, (net.get(key) ?? 0) + m.delta * m.price);
    const day = days.find((d) => d.key === key);
    if (!day || m.type === "ajuste") continue;
    if (m.delta < 0) day.out -= m.delta; else day.in += m.delta;
  }
  const trend: number[] = [];
  let running = value;
  for (let i = days.length - 1; i >= 0; i--) {
    trend[i] = running;
    running -= net.get(days[i].key) ?? 0;
  }
  const trendChange = pct(trend[trend.length - 1] - trend[0], trend[0]);
  const avgOut = sum(days, (d) => d.out) / DAYS;
  const coverage = avgOut ? Math.round(bottles / avgOut) : null;
  const week = days.slice(-7);

  const focus = byRegion.find((r) => regionMeta(r.name)?.slug === regiao) ?? byRegion[0];
  const focusMeta = regionMeta(focus.name);
  const focusWines = list.filter((w) => w.region === focus.name).sort((a, b) => b.priceCents - a.priceCents);

  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <AutoRefresh seconds={30} />

      {/* vendas: o dia (ou período) escolhido, com navegação */}
      <section className="card lift xl:col-span-12">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="mr-auto">
            <p className="text-sm text-muted">Vendas · {single ? (from === today ? "hoje" : "dia") : `${length} dias`}</p>
            <h1 className="text-2xl font-semibold tracking-tight first-letter:uppercase">{periodLabel}</h1>
          </div>
          <div className="flex items-center gap-1">
            <Link href={prevHref} scroll={false} className="btn-ghost" aria-label={single ? "Dia anterior" : "Período anterior"}>← {single ? "Dia anterior" : "Anterior"}</Link>
            {nextHref
              ? <Link href={nextHref} scroll={false} className="btn-ghost" aria-label={single ? "Dia seguinte" : "Próximo período"}>{single ? "Dia seguinte" : "Próximo"} →</Link>
              : <span className="btn-ghost cursor-not-allowed opacity-40" aria-disabled="true">{single ? "Dia seguinte" : "Próximo"} →</span>}
          </div>
          <div className="flex flex-wrap gap-1">
            {presets.map((p) => <Link key={p.label} href={p.href} scroll={false} aria-current={p.on ? "true" : undefined} className={p.on ? "btn" : "btn-ghost"}>{p.label}</Link>)}
          </div>
          <details className="relative">
            <summary className="btn-ghost list-none">Escolher datas</summary>
            <div className="card absolute right-0 z-20 mt-2 w-72 space-y-4 bg-card">
              <form action="/" className="flex items-end gap-2">
                {regiao && <input type="hidden" name="regiao" value={regiao} />}
                <div className="flex-1"><label className="label" htmlFor="dia">Um dia</label><input className="input" id="dia" name="dia" type="date" max={today} defaultValue={from} required /></div>
                <button className="btn">Ver</button>
              </form>
              <form action="/" className="space-y-2">
                {regiao && <input type="hidden" name="regiao" value={regiao} />}
                <div className="flex gap-2">
                  <div className="flex-1"><label className="label" htmlFor="de">De</label><input className="input" id="de" name="de" type="date" max={today} defaultValue={from} required /></div>
                  <div className="flex-1"><label className="label" htmlFor="ate">Até</label><input className="input" id="ate" name="ate" type="date" max={today} defaultValue={to} required /></div>
                </div>
                <button className="btn w-full">Ver período</button>
                <p className="text-[11px] text-muted">Até {MAX_PERIOD} dias por vez.</p>
              </form>
            </div>
          </details>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="tile">
            <p className="text-sm text-muted">Vendas</p>
            <p className="num mt-1 text-4xl">{usd(revenue)}</p>
            <p className="text-xs tabular-nums text-muted">{brl(revenue, rates)} · {pyg(revenue, rates)}</p>
          </div>
          {costs ? (
            <div className="tile">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-muted">Lucro</p>
                {revenue > 0 && <span className="badge-gold">{pct(profit, revenue).toFixed(0)}% de margem</span>}
              </div>
              <p className="num mt-1 text-4xl text-gold">{usd(profit)}</p>
              <p className="text-xs tabular-nums text-muted">custo das garrafas {usd(revenue - profit)}</p>
            </div>
          ) : (
            <div className="tile">
              <p className="text-sm text-muted">Média por dia</p>
              <p className="num mt-1 text-4xl">{usd(Math.round(revenue / length))}</p>
              <p className="text-xs text-muted">no período</p>
            </div>
          )}
          <div className="tile">
            <p className="text-sm text-muted">Garrafas vendidas</p>
            <p className="num mt-1 text-4xl">{soldBottles}</p>
            <p className="text-xs text-muted">{soldWines.length} {soldWines.length === 1 ? "rótulo diferente" : "rótulos diferentes"}</p>
          </div>
          <div className="tile">
            <p className="text-sm text-muted">Preço médio por garrafa</p>
            <p className="num mt-1 text-4xl">{soldBottles ? usd(Math.round(revenue / soldBottles)) : "—"}</p>
            <p className="text-xs text-muted">{single ? "neste dia" : `média de ${(soldBottles / length).toFixed(1)} garrafas por dia`}</p>
          </div>
        </div>

        <div className="mt-5">
          <p className="mb-1 text-xs text-muted">Vendas por dia em US$. Toque em uma barra para abrir aquele dia.</p>
          <DayBars days={strip} label="Vendas por dia" />
        </div>
      </section>

      <section className="card lift xl:col-span-4">
        <h2 className="font-semibold tracking-tight">Vendas por região</h2>
        <p className="mb-4 text-xs text-muted first-letter:uppercase">{periodLabel}</p>
        {soldByRegion.length === 0 ? <p className="text-sm text-muted">Nenhuma venda {single ? "neste dia" : "neste período"}.</p> : (
          <HBars tone="gold" rows={soldByRegion.map((r) => ({ name: r.name, value: r.value, text: `${r.bottles} garrafas · ${usd(r.value)}` }))} />
        )}
      </section>

      <section className="card lift xl:col-span-5">
        <h2 className="font-semibold tracking-tight">Vinhos mais vendidos</h2>
        <p className="mb-4 text-xs text-muted first-letter:uppercase">{periodLabel}</p>
        {soldWines.length === 0 ? <p className="text-sm text-muted">Nenhuma venda {single ? "neste dia" : "neste período"}.</p> : (
          <ol className="space-y-3">
            {soldWines.slice(0, 6).map((w, i) => {
              const info = wineInfo.get(w.name)!;
              return (
                <li key={w.name} className="flex items-center gap-3">
                  <span className={`num flex size-9 shrink-0 items-center justify-center rounded-full text-sm ${i === 0 ? "bg-gold text-inverse-fg" : "bg-fg/10"}`} aria-hidden="true">{i + 1}</span>
                  <Link href={`/estoque/${info.wineId}`} className="min-w-0 flex-1 hover:underline">
                    <span className="block truncate font-medium">{info.wine}</span>
                    <span className="block truncate text-xs text-muted">{info.producer} · {info.region}</span>
                  </Link>
                  <span className="shrink-0 text-right">
                    <span className="num block">{w.bottles} <span className="text-xs font-normal text-muted">garrafas</span></span>
                    <span className="block text-xs tabular-nums text-muted">{usd(w.value)}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="card lift xl:col-span-3">
        <h2 className="font-semibold tracking-tight">Tipos vendidos</h2>
        <p className="mb-4 text-xs text-muted first-letter:uppercase">{periodLabel}</p>
        {soldByType.length === 0 ? <p className="text-sm text-muted">Nenhuma venda {single ? "neste dia" : "neste período"}.</p> : (
          <div className="flex flex-col items-center gap-4">
            <DonutArc segments={soldByType.map((t) => ({ name: t.name, value: t.bottles, color: TYPE_COLOR[t.name] }))} center={String(soldBottles)} caption="garrafas" />
            <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
              {soldByType.map((t) => (
                <li key={t.name} className="capitalize text-muted"><i className="mr-1.5 inline-block size-2 rounded-full" style={{ background: TYPE_COLOR[t.name] }} />{t.name} <b className="text-fg">{pct(t.bottles, soldBottles).toFixed(0)}%</b></li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* estoque agora */}
      <section className="card lift xl:col-span-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight">Estoque agora</h2>
          <span className="text-xs text-muted">US$ 1 = R$ {rates.brl.toLocaleString("pt-BR")} = ₲ {rates.pyg.toLocaleString("pt-BR")}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="tile col-span-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-muted">Estoque a preço de venda</p>
              <span className="badge-gold shrink-0">{trendChange >= 0 ? "▲" : "▼"} {Math.abs(trendChange).toFixed(1)}% em {DAYS} dias</span>
            </div>
            <p className="num mt-1 text-4xl">{usd(value)}</p>
            <p className="text-xs tabular-nums text-muted">{brl(value, rates)} · {pyg(value, rates)}</p>
            <Sparkline values={trend} label={`Valor do estoque nos últimos ${DAYS} dias`} />
          </div>
          <div className="tile flex flex-col justify-between">
            {costs ? (
              <>
                <p className="text-sm text-muted">Margem do estoque</p>
                <Gauge value={margin} caption="margem" />
                <p className="mt-2 text-center text-xs tabular-nums text-muted">lucro potencial {usd(value - cost)}</p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted">Garrafas</p>
                <p className="num text-3xl">{bottles}</p>
                <p className="text-xs text-muted">{list.length} rótulos</p>
              </>
            )}
          </div>
          <div className="tile">
            <p className="text-sm text-muted">Saídas, últimos 7 dias</p>
            <p className="mb-3 mt-1 flex items-baseline gap-1.5"><span className="num text-3xl">{sum(week, (d) => d.out)}</span><span className="text-xs text-muted">garrafas</span></p>
            <Lollipops values={week.map((d) => d.out)} labels={week.map((d) => `Dia ${d.label}`)} label="Saídas por dia nos últimos 7 dias" />
          </div>
          <div className="tile">
            <p className="text-sm text-muted">Abaixo do mínimo</p>
            <p className="mb-3 mt-1 flex items-baseline gap-1.5"><span className="num text-3xl">{lowAll.length}</span><span className="text-xs text-muted">de {list.length} rótulos</span></p>
            <DotGrid total={list.length} marked={lowAll.length} label={`${lowAll.length} de ${list.length} rótulos abaixo do mínimo`} />
          </div>
          <div className="tile">
            <p className="text-sm text-muted">Cobertura</p>
            <p className="mt-1 flex items-baseline gap-1.5"><span className="num text-3xl">{coverage ?? "—"}</span><span className="text-xs text-muted">dias de estoque</span></p>
            <p className="mt-1 text-xs text-muted">no ritmo de {avgOut.toFixed(1)} garrafas por dia</p>
            <div className="mt-3 h-1.5 rounded-full bg-fg/10"><div className="grow-x h-full rounded-full bg-gradient-to-r from-gold/30 to-gold" style={{ width: `${Math.min(100, pct(coverage ?? 0, 60))}%` }} /></div>
            <p className="mt-1 text-[10px] text-muted">escala: 60 dias</p>
          </div>
        </div>
      </section>

      <section className="card lift xl:col-span-7">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">A adega por origem</h2>
            <p className="text-sm text-muted">Toque em uma região para ver os números dela.</p>
          </div>
          <p className="text-sm text-muted">
            <span className="num text-fg">{bottles}</span> garrafas · <span className="num text-fg">{list.length}</span> rótulos · <span className="num text-fg">{byRegion.length}</span> regiões
          </p>
        </div>
        <div className="mt-2"><WorldMap regions={byRegion} active={focusMeta?.slug} href={(slug) => link({ regiao: slug })} /></div>
        <div className="tile mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <p><span className="badge-gold">Região em foco</span> <span className="ml-2 text-xs text-muted">{pct(focus.value, value).toFixed(0)}% do valor do estoque</span></p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight">{focus.name}</h3>
            <p className="text-xs text-muted">{focusMeta?.blurb}</p>
          </div>
          <div>
            <p className="num text-3xl">{usd(focus.value)}</p>
            <p className="text-xs text-muted">{focus.bottles} garrafas · {focus.labels} rótulos</p>
          </div>
          <Link href={`/estoque?regiao=${focusWines[0]?.regionId}`} className="btn">Ver rótulos</Link>
        </div>
      </section>

      <section className="card lift xl:col-span-4">
        <h2 className="font-semibold tracking-tight">Mix do estoque por tipo</h2>
        <p className="mb-4 text-xs text-muted">Garrafas em estoque</p>
        <div className="flex items-center gap-5">
          <DonutArc segments={byType.map((t) => ({ name: t.name, value: t.bottles, color: TYPE_COLOR[t.name] }))} center={String(bottles)} caption="garrafas" />
          <ul className="min-w-0 flex-1 space-y-2">
            {byType.map((t) => (
              <li key={t.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-xs capitalize text-muted"><i className="size-2 rounded-full" style={{ background: TYPE_COLOR[t.name] }} />{t.name}</span>
                <span className="num">{pct(t.bottles, bottles).toFixed(0)}%</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="card lift xl:col-span-4">
        <h2 className="font-semibold tracking-tight">Rótulos por faixa de preço</h2>
        <p className="mb-4 text-xs text-muted">Quantos rótulos em cada faixa</p>
        <Columns rows={bands} label="Número de rótulos por faixa de preço" />
      </section>

      <section className="card lift xl:col-span-4">
        <h2 className="font-semibold tracking-tight">Uvas com mais garrafas</h2>
        <p className="mb-4 text-xs text-muted">Seis principais</p>
        <HBars tone="wine" rows={byGrape.map((g) => ({ name: g.name, value: g.bottles, text: `${g.bottles} · ${g.labels} ${g.labels === 1 ? "rótulo" : "rótulos"}` }))} />
      </section>

      <section className="card lift xl:col-span-4">
        <h2 className="mb-4 font-semibold tracking-tight">Repor agora</h2>
        {lowAll.length === 0 ? <p className="text-sm text-muted">Nenhum rótulo abaixo do mínimo.</p> : (
          <ul className="space-y-3">
            {lowAll.slice(0, 6).map((w) => (
              <li key={w.id}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <Link href={`/estoque/${w.id}`} className="truncate hover:underline">{w.name} <span className="text-muted">{w.producer}</span></Link>
                  <span className="shrink-0 tabular-nums"><b>{w.stock}</b><span className="text-muted"> de {w.minStock}</span></span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-fg/10"><div className="grow-x h-full rounded-full bg-gradient-to-r from-wine/40 to-wine" style={{ width: `${Math.min(100, pct(w.stock, w.minStock))}%` }} /></div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card lift xl:col-span-4">
        <h2 className="mb-4 font-semibold tracking-tight">Maior valor parado</h2>
        <ol className="space-y-3">
          {top.map((w, i) => (
            <li key={w.id} className="flex items-center gap-3">
              <span className="num flex size-9 shrink-0 items-center justify-center rounded-full bg-fg/10 text-sm" aria-hidden="true">{i + 1}</span>
              <Link href={`/estoque/${w.id}`} className="min-w-0 flex-1 hover:underline">
                <span className="block truncate font-medium">{w.name}</span>
                <span className="block truncate text-xs text-muted">{w.producer} · {w.stock} × {usd(w.priceCents)}</span>
              </Link>
              <span className="num shrink-0">{usd(w.stock * w.priceCents)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="card lift xl:col-span-4">
        <h2 className="mb-4 font-semibold tracking-tight">Últimos movimentos</h2>
        <ul className="space-y-3">
          {recent.map(({ m, wine, user }) => (
            <li key={m.id} className="flex items-center gap-3 text-sm">
              <span className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${m.delta < 0 ? "bg-wine text-white" : "bg-gold text-inverse-fg"}`} aria-hidden="true">
                {m.delta < 0 ? "↓" : "↑"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{wine}</span>
                <span className="block truncate text-xs text-muted">
                  {m.createdAt.toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {user ?? "sistema"}
                </span>
              </span>
              <span className="num shrink-0">{m.delta > 0 ? "+" : ""}{m.delta}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
