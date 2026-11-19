import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { dailyRates, regions, settings } from "@/db/schema";
import { todayKey } from "./dates";
import type { Rates } from "./money";

const setting = async () => {
  const rows = await db.select().from(settings);
  return (k: string) => rows.find((r) => r.key === k)?.value;
};

/** Cotação de mercado do dólar. Sem chave e sem dado nosso na chamada. null se a fonte não responder. */
async function fetchMarketRates(): Promise<Rates | null> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store", signal: AbortSignal.timeout(4000) });
    const { rates } = (await res.json()) as { rates?: { PYG?: number; BRL?: number } };
    return rates?.PYG && rates.BRL ? { pyg: Math.round(rates.PYG), brl: Math.round(rates.BRL * 100) / 100 } : null;
  } catch {
    return null;
  }
}

/**
 * Câmbio de hoje, cravado na primeira consulta do dia: todas as telas e vendas do dia usam o mesmo número.
 * Modo automático busca a cotação de mercado; se a fonte falhar, repete o último câmbio conhecido.
 */
export async function getRateInfo() {
  const day = todayKey();
  const [fixed] = await db.select().from(dailyRates).where(eq(dailyRates.day, day));
  if (fixed) return fixed;
  const get = await setting();
  let row = { day, pyg: Number(get("pyg_per_usd")) || 0, brl: Number(get("brl_per_usd")) || 0, source: "manual" };
  if (get("rate_mode") === "auto") {
    const live = await fetchMarketRates();
    const [last] = live ? [] : await db.select().from(dailyRates).orderBy(desc(dailyRates.day)).limit(1);
    row = live ? { day, ...live, source: "automático" } : { ...row, ...(last && { pyg: last.pyg, brl: last.brl }), source: "último conhecido" };
  }
  // duas telas abrindo ao mesmo tempo: vale a que gravar primeiro
  await db.insert(dailyRates).values(row).onConflictDoNothing();
  return (await db.select().from(dailyRates).where(eq(dailyRates.day, day)))[0] ?? row;
}

export const getRates = async (): Promise<Rates> => { const r = await getRateInfo(); return { pyg: r.pyg, brl: r.brl }; };
export const getRateMode = async () => ((await setting())("rate_mode") === "auto" ? "auto" : "manual");
export const getRateHistory = () => db.select().from(dailyRates).orderBy(desc(dailyRates.day)).limit(7);

export const getRegions = () => db.select().from(regions).orderBy(regions.name);

/** Parâmetros do cálculo de reposição, definidos em Configurações. */
export async function getReorderParams() {
  const get = await setting();
  return { leadDays: Number(get("lead_days")) || 14, safetyDays: Number(get("safety_days")) || 7 };
}

/** IVA embutido no preço de prateleira, em %. */
export async function getIvaPercent() {
  const v = (await setting())("iva_percent");
  return v === undefined ? 10 : Number(v) || 0;
}
