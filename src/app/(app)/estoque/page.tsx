import { eq } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { WinePhoto } from "@/components/bottle";
import { Flash } from "@/components/ui";
import { StockDashboard } from "./dashboard";
import { db } from "@/db";
import { regions, WINE_TYPES, wines } from "@/db/schema";
import { abcClasses, reorder } from "@/lib/analytics";
import { canSeeCosts, requireUser } from "@/lib/auth";
import { normalize } from "@/lib/csv";
import { getRates, getRegions, getReorderParams } from "@/lib/data";
import { addDays, todayKey } from "@/lib/dates";
import { brl, pyg, usd } from "@/lib/money";
import { getSales } from "@/lib/sales";

const WINDOW = 30;
const STATUS = {
  repor: { label: "Repor", tone: "badge-wine" },
  zerado: { label: "Zerado", tone: "badge-wine" },
  parado: { label: "Sem venda", tone: "badge-gold" },
  ok: { label: "Em dia", tone: "badge" },
} as const;
const SORTS = {
  nome: "Nome", estoque: "Menor estoque", cobertura: "Menor cobertura", vendas: "Mais vendidos", valor: "Maior valor em estoque", margem: "Maior margem",
};

// lê a URL a cada acesso; navegação resolve no servidor
export const instant = false;

export default async function Estoque({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  await connection();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const q = one("q"), regionId = Number(one("regiao")) || 0, type = one("tipo"), status = one("status"), abcFilter = one("abc");
  const sort = one("ordem") in SORTS ? (one("ordem") as keyof typeof SORTS) : "nome";
  // qualquer filtro abre a lista; sem nada, a aba abre no painel
  const listMode = one("ver") === "lista" || Boolean(q || regionId || type || status || abcFilter || one("ordem"));
  const costs = canSeeCosts(user);
  const canEdit = user.role !== "caixa";
  const today = todayKey();

  const [rows, regionList, rates, params, sales] = await Promise.all([
    db.select({ w: wines, region: regions.name }).from(wines).innerJoin(regions, eq(regions.id, wines.regionId)),
    getRegions(), getRates(), getReorderParams(), getSales(addDays(today, -(WINDOW - 1)), today),
  ]);

  const soldQty = new Map<number, number>(), soldRevenue = new Map<number, number>();
  for (const s of sales) {
    soldQty.set(s.wineId, (soldQty.get(s.wineId) ?? 0) + s.qty);
    soldRevenue.set(s.wineId, (soldRevenue.get(s.wineId) ?? 0) + s.revenue);
  }
  const abc = abcClasses(rows.map(({ w }) => ({ id: w.id, revenue: soldRevenue.get(w.id) ?? 0 })));

  const all = rows.map(({ w, region }) => {
    const sold = soldQty.get(w.id) ?? 0;
    const r = reorder({ stock: w.stock, dailyRate: sold / WINDOW, minStock: w.minStock, ...params });
    const state: keyof typeof STATUS = w.stock === 0 ? "zerado" : w.stock <= r.point ? "repor" : sold === 0 ? "parado" : "ok";
    return {
      ...w, region, sold, ...r, state, abc: abc.get(w.id) ?? "C",
      value: w.stock * w.priceCents, margin: w.priceCents ? ((w.priceCents - w.costCents) / w.priceCents) * 100 : 0,
    };
  });
  const active = all.filter((w) => w.active);

  type Row = (typeof all)[number];
  const sorters: Record<keyof typeof SORTS, (a: Row, b: Row) => number> = {
    nome: (a, b) => a.name.localeCompare(b.name, "pt"),
    estoque: (a, b) => a.stock - b.stock,
    cobertura: (a, b) => (a.coverage ?? Infinity) - (b.coverage ?? Infinity),
    vendas: (a, b) => b.sold - a.sold,
    valor: (a, b) => b.value - a.value,
    margem: (a, b) => b.margin - a.margin,
  };
  const nq = normalize(q);
  const shown = (status === "inativos" ? all.filter((w) => !w.active) : active)
    .filter((w) => !q || [w.name, w.producer, w.grape, w.subregion].some((f) => normalize(f).includes(nq)) || w.barcode === q || String(w.itemNumber) === q)
    .filter((w) => !regionId || w.regionId === regionId)
    .filter((w) => !type || w.type === type)
    .filter((w) => !(status in STATUS) || w.state === status)
    .filter((w) => !abcFilter || w.abc === abcFilter)
    .sort(sorters[sort]);

  const href = (p: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ver: "lista", q, regiao: regionId ? String(regionId) : "", tipo: type, status, abc: abcFilter, ordem: sort === "nome" ? "" : sort, ...p })) if (v) u.set(k, v);
    return `/estoque?${u}`;
  };
  const count = (s: keyof typeof STATUS) => active.filter((w) => w.state === s);
  const sumValue = (list: typeof all) => list.reduce((t, w) => t + w.value, 0);
  const toBuy = active.filter((w) => w.suggest > 0);
  const tiles = [
    { key: "", label: "Rótulos ativos", big: String(active.length), small: `${active.reduce((t, w) => t + w.stock, 0)} garrafas · ${usd(sumValue(active))}` },
    { key: "repor", label: "Repor agora", big: String(count("repor").length), small: `sugestão: ${toBuy.reduce((t, w) => t + w.suggest, 0)} garrafas${costs ? ` · ${usd(toBuy.reduce((t, w) => t + w.suggest * w.costCents, 0))}` : ""}` },
    { key: "zerado", label: "Zerados", big: String(count("zerado").length), small: "sem garrafa para vender" },
    { key: "parado", label: `Sem venda em ${WINDOW} dias`, big: String(count("parado").length), small: `${usd(sumValue(count("parado")))} parados` },
  ];

  return (
    <>
      <Flash sp={sp} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold tracking-tight">Estoque</h1>
          <p className="text-sm text-muted">Vendas e giro calculados sobre os últimos {WINDOW} dias. Reposição: {params.leadDays} dias de entrega + {params.safetyDays} de folga.</p>
        </div>
        <div className="flex rounded-full border border-line p-1" role="group" aria-label="Modo de visualização">
          <Link href="/estoque" aria-current={listMode ? undefined : "page"} className={`rounded-full px-4 py-1.5 text-sm font-medium ${listMode ? "text-muted hover:text-fg" : "bg-inverse text-inverse-fg"}`}>Painel</Link>
          <Link href="/estoque?ver=lista" aria-current={listMode ? "page" : undefined} className={`rounded-full px-4 py-1.5 text-sm font-medium ${listMode ? "bg-inverse text-inverse-fg" : "text-muted hover:text-fg"}`}>Lista</Link>
        </div>
        <Link className="btn-ghost" href="/estoque/exportar" prefetch={false}>Exportar planilha</Link>
        {canEdit && (
          <>
            <Link className="btn-ghost" href="/estoque/balanco">Fazer balanço</Link>
            <Link className="btn-ghost" href="/estoque/importar">Importar planilha</Link>
            <Link className="btn" href="/estoque/novo">Novo vinho</Link>
          </>
        )}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((t) => {
          const on = listMode && status === t.key;
          return (
            <Link key={t.label} href={href({ status: t.key })} scroll={false} aria-current={on ? "true" : undefined}
              className={`card lift block ${on ? "!border-gold" : ""}`}>
              <p className="text-sm text-muted">{t.label}</p>
              <p className={`num mt-1 text-4xl ${t.key && t.big !== "0" ? "text-gold" : ""}`}>{t.big}</p>
              <p className="text-xs text-muted">{t.small}</p>
            </Link>
          );
        })}
      </div>

      {!listMode ? <StockDashboard rows={active} costs={costs} href={href} window={WINDOW} /> : (
      <div className="card">
        <form className="mb-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="ver" value="lista" />
          {status && <input type="hidden" name="status" value={status} />}
          <div className="min-w-56 flex-1">
            <label className="label" htmlFor="q">Buscar por nome, produtor, uva, nº do item ou código de barras</label>
            <input className="input" id="q" name="q" defaultValue={q} autoFocus placeholder="Digite ou bipe o código" />
          </div>
          <div>
            <label className="label" htmlFor="regiao">Região</label>
            <select className="input" id="regiao" name="regiao" defaultValue={regionId || ""}>
              <option value="">Todas</option>
              {regionList.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="tipo">Tipo</label>
            <select className="input capitalize" id="tipo" name="tipo" defaultValue={type}>
              <option value="">Todos</option>
              {WINE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="abc">Curva ABC</label>
            <select className="input" id="abc" name="abc" defaultValue={abcFilter}>
              <option value="">Todas</option>
              <option value="A">A · carro-chefe</option><option value="B">B · intermediário</option><option value="C">C · pouco giro</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ordem">Ordenar por</label>
            <select className="input" id="ordem" name="ordem" defaultValue={sort}>
              {Object.entries(SORTS).filter(([k]) => costs || k !== "margem").map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <button className="btn">Aplicar</button>
          {(q || regionId || type || status || abcFilter) && <Link className="btn-ghost" href="/estoque?ver=lista">Limpar</Link>}
        </form>

        <p className="mb-2 text-xs text-muted">
          {shown.length} de {status === "inativos" ? all.length - active.length : active.length} rótulos
          {status !== "inativos" && all.length > active.length && <> · <Link className="underline underline-offset-2" href={href({ status: "inativos" })}>ver {all.length - active.length} inativos</Link></>}
        </p>

        {shown.length === 0 ? <p className="py-10 text-center text-sm text-muted">Nenhum vinho com esses filtros.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Vinho</th><th className="th">Região</th><th className="th">ABC</th>
                  <th className="th text-right">Preço</th>{costs && <th className="th text-right">Margem</th>}
                  <th className="th">Estoque e ponto de reposição</th><th className="th text-right">Vendas {WINDOW}d</th>
                  <th className="th text-right">Cobertura</th><th className="th">Situação</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((w) => {
                  const scale = Math.max(w.stock, w.point * 2, 1);
                  return (
                    <tr key={w.id} className="transition-colors hover:bg-fg/[0.04]">
                      <td className="td">
                        <Link href={`/estoque/${w.id}`} className="group flex items-center gap-3">
                          <WinePhoto wine={w} className="h-11 shrink-0" />
                          <span className="min-w-0">
                            <span className="block font-medium group-hover:underline">{w.name} {w.vintage ?? ""}</span>
                            <span className="block text-xs text-muted">nº {w.itemNumber} · {[w.producer, w.grape].filter(Boolean).join(" · ")}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="td whitespace-nowrap">{w.region}{w.subregion && <span className="block text-xs text-muted">{w.subregion}</span>}</td>
                      <td className="td"><span className={`num flex size-7 items-center justify-center rounded-full text-xs ${w.abc === "A" ? "bg-gold text-inverse-fg" : w.abc === "B" ? "bg-fg/15" : "bg-fg/5 text-muted"}`}>{w.abc}</span></td>
                      <td className="td whitespace-nowrap text-right tabular-nums">
                        <span className="num block">{usd(w.priceCents)}</span>
                        <span className="block text-xs text-muted">{brl(w.priceCents, rates)} · {pyg(w.priceCents, rates)}</span>
                      </td>
                      {costs && <td className="td text-right tabular-nums">{w.margin.toFixed(0)}%<span className="block text-xs text-muted">custo {usd(w.costCents)}</span></td>}
                      <td className="td min-w-44">
                        <div className="flex items-baseline justify-between text-xs"><span className="num text-base">{w.stock}</span><span className="text-muted">repor em {w.point}</span></div>
                        <div className="relative mt-1 h-1.5 rounded-full bg-fg/10" role="img" aria-label={`${w.stock} em estoque, repor ao chegar em ${w.point}`}>
                          <div className={`h-full rounded-full bg-gradient-to-r ${w.stock <= w.point ? "from-wine/40 to-wine" : "from-gold/30 to-gold"}`} style={{ width: `${(w.stock / scale) * 100}%` }} />
                          <i className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-fg" style={{ left: `${(w.point / scale) * 100}%` }} />
                        </div>
                      </td>
                      <td className="td text-right tabular-nums">{w.sold}</td>
                      <td className="td whitespace-nowrap text-right tabular-nums">{w.coverage === null ? <span className="text-muted">sem venda</span> : `${w.coverage} dias`}</td>
                      <td className="td whitespace-nowrap">
                        <span className={STATUS[w.state].tone}>{STATUS[w.state].label}</span>
                        {w.suggest > 0 && <span className="mt-1 block text-xs text-muted">pedir {w.suggest}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}
    </>
  );
}
