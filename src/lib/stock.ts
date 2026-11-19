import { eq, max } from "drizzle-orm";
import type { Db, Tx } from "../db/client.ts";
import { type MovementType, stockMovements, WINE_TYPES, wines } from "../db/schema.ts";
import { parseMoney } from "./money.ts";

/** Erro com mensagem que pode ser mostrada ao usuário. */
export class UserError extends Error {}

type Movement = {
  wineId: number; type: MovementType; qty: number; note?: string; userId: number | null;
  saleId?: number; unitPriceCents?: number; unitCostCents?: number;
};

export async function move(tx: Tx, m: Movement) {
  if (!Number.isInteger(m.qty) || m.qty < 0 || (m.type !== "ajuste" && m.qty === 0))
    throw new UserError("Quantidade inválida");
  const [wine] = await tx.select({ stock: wines.stock }).from(wines).where(eq(wines.id, m.wineId));
  if (!wine) throw new UserError("Vinho não encontrado");
  // ajuste = contagem física: qty é o total contado, não a diferença
  const delta = m.type === "entrada" ? m.qty : m.type === "ajuste" ? m.qty - wine.stock : -m.qty;
  const stockAfter = wine.stock + delta;
  if (stockAfter < 0) throw new UserError(`Estoque insuficiente (há ${wine.stock})`);
  await tx.update(wines).set({ stock: stockAfter, updatedAt: new Date() }).where(eq(wines.id, m.wineId));
  await tx.insert(stockMovements).values({
    wineId: m.wineId, type: m.type, delta, stockAfter, note: m.note ?? "", userId: m.userId,
    saleId: m.saleId, unitPriceCents: m.unitPriceCents, unitCostCents: m.unitCostCents,
  });
  return stockAfter;
}

export const applyMovement = (db: Db, m: Movement) => db.transaction((tx) => move(tx, m));

export type WineInput = {
  name: string; producer: string; regionId: number; subregion: string; grape: string;
  vintage: number | null; type: (typeof WINE_TYPES)[number]; priceCents: number; costCents: number;
  minStock: number; barcode: string | null;
};

/** Valida campos vindos de formulário ou CSV. regionId já resolvido por quem chama. */
export function parseWineInput(f: Record<string, string | undefined>, regionId: number | undefined): WineInput {
  const name = (f.name ?? "").trim();
  if (!name) throw new UserError("Nome é obrigatório");
  if (!regionId) throw new UserError(`Região inválida: "${f.region ?? ""}"`);
  const priceCents = parseMoney(f.price ?? "");
  if (priceCents === null || priceCents <= 0) throw new UserError("Preço inválido");
  const costCents = f.cost?.trim() ? parseMoney(f.cost) : 0;
  if (costCents === null) throw new UserError("Custo inválido");
  const vintageRaw = (f.vintage ?? "").trim();
  const vintage = vintageRaw && !/^(nv|sv|s\/s)$/i.test(vintageRaw) ? Number(vintageRaw) : null;
  if (vintage !== null && (!Number.isInteger(vintage) || vintage < 1900 || vintage > 2100))
    throw new UserError(`Safra inválida: "${vintageRaw}"`);
  const type = (f.type ?? "").trim().toLowerCase() || "tinto";
  if (!(WINE_TYPES as readonly string[]).includes(type)) throw new UserError(`Tipo inválido: "${f.type}"`);
  const minStock = f.minStock?.trim() ? Number(f.minStock) : 0;
  if (!Number.isInteger(minStock) || minStock < 0) throw new UserError("Estoque mínimo inválido");
  return {
    name, regionId, priceCents, costCents, vintage, minStock,
    type: type as WineInput["type"],
    producer: (f.producer ?? "").trim(),
    subregion: (f.subregion ?? "").trim(),
    grape: (f.grape ?? "").trim(),
    barcode: (f.barcode ?? "").trim() || null,
  };
}

async function assertBarcodeFree(tx: Tx, barcode: string | null, exceptId?: number) {
  if (!barcode) return;
  const [hit] = await tx.select({ id: wines.id, name: wines.name }).from(wines).where(eq(wines.barcode, barcode));
  if (hit && hit.id !== exceptId) throw new UserError(`Código de barras ${barcode} já pertence a "${hit.name}"`);
}

async function insertWine(tx: Tx, input: WineInput, initialStock: number, userId: number | null) {
  if (!Number.isInteger(initialStock) || initialStock < 0) throw new UserError("Estoque inicial inválido");
  await assertBarcodeFree(tx, input.barcode);
  const [{ last }] = await tx.select({ last: max(wines.itemNumber) }).from(wines);
  const [wine] = await tx.insert(wines).values({ ...input, itemNumber: (last ?? 1000) + 1 }).returning({ id: wines.id });
  if (initialStock > 0) await move(tx, { wineId: wine.id, type: "entrada", qty: initialStock, note: "Estoque inicial", userId });
  return wine.id;
}

export const createWine = (db: Db, input: WineInput, initialStock: number, userId: number | null) =>
  db.transaction((tx) => insertWine(tx, input, initialStock, userId));

/** Tudo ou nada: uma linha inválida cancela a importação inteira. */
export const createWines = (db: Db, rows: { input: WineInput; stock: number }[], userId: number | null) =>
  db.transaction(async (tx) => {
    for (const r of rows) await insertWine(tx, r.input, r.stock, userId);
    return rows.length;
  });

export const updateWine = (db: Db, id: number, input: WineInput) =>
  db.transaction(async (tx) => {
    await assertBarcodeFree(tx, input.barcode, id);
    await tx.update(wines).set({ ...input, updatedAt: new Date() }).where(eq(wines.id, id));
  });

/** Balanço: aplica as contagens de uma vez. Só gera movimento onde o contado difere do sistema. */
export const applyCounts = (db: Db, counts: { wineId: number; counted: number }[], note: string, userId: number | null) =>
  db.transaction(async (tx) => {
    let changed = 0, diff = 0;
    for (const c of counts) {
      const [wine] = await tx.select({ stock: wines.stock }).from(wines).where(eq(wines.id, c.wineId));
      if (!wine) throw new UserError("Vinho não encontrado");
      if (wine.stock === c.counted) continue;
      await move(tx, { wineId: c.wineId, type: "ajuste", qty: c.counted, note, userId });
      changed += 1;
      diff += c.counted - wine.stock;
    }
    return { changed, diff };
  });
