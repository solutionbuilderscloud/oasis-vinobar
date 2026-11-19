import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, expect, test } from "vitest";
import { createDb, type Db } from "../db/client.ts";
import { eventWines, events, regions, stockMovements, wines } from "../db/schema.ts";
import { abcClasses, breakEven, reorder, toUsdCents } from "./analytics.ts";
import { concludeEvent } from "./events.ts";
import { applyCounts, applyMovement, createWine, parseWineInput } from "./stock.ts";

test("curva ABC", () => {
  const abc = abcClasses([{ id: 1, revenue: 700 }, { id: 2, revenue: 150 }, { id: 3, revenue: 100 }, { id: 4, revenue: 50 }, { id: 5, revenue: 0 }]);
  expect([1, 2, 3, 4, 5].map((id) => abc.get(id))).toEqual(["A", "A", "B", "C", "C"]);
  expect(abcClasses([{ id: 1, revenue: 0 }]).get(1)).toBe("C");
  expect(abcClasses([{ id: 9, revenue: 10 }]).get(9)).toBe("A");
});

test("ponto de reposição e sugestão", () => {
  // vende 2 por dia, 14 de entrega + 7 de segurança = pedir ao chegar em 42
  expect(reorder({ stock: 40, dailyRate: 2, leadDays: 14, safetyDays: 7, minStock: 6 })).toEqual({ point: 42, suggest: 62, coverage: 20 });
  expect(reorder({ stock: 100, dailyRate: 2, leadDays: 14, safetyDays: 7, minStock: 6 }).suggest).toBe(0);
  // sem venda: vale o mínimo cadastrado
  expect(reorder({ stock: 3, dailyRate: 0, leadDays: 14, safetyDays: 7, minStock: 6 })).toEqual({ point: 6, suggest: 3, coverage: null });
});

test("câmbio e ponto de equilíbrio", () => {
  const rates = { pyg: 7500, brl: 5.5 };
  expect(toUsdCents(750_000_00, "PYG", rates)).toBe(100_00);
  expect(toUsdCents(55_00, "BRL", rates)).toBe(10_00);
  expect(toUsdCents(12_34, "USD", rates)).toBe(12_34);
  expect(toUsdCents(100, "PYG", { pyg: 0, brl: 0 })).toBe(0);
  expect(breakEven(4000_00, 0.4)).toBe(10000_00);
  expect(breakEven(4000_00, 0)).toBeNull();
});

let db: Db;
let a: number, b: number;
beforeAll(async () => {
  db = createDb(`file:${join(mkdtempSync(join(tmpdir(), "oasis-")), "t.db")}`);
  await migrate(db, { migrationsFolder: "./drizzle" });
  const [{ id: regionId }] = await db.insert(regions).values({ name: "Chile" }).returning();
  a = await createWine(db, parseWineInput({ name: "A", price: "10" }, regionId), 10, null);
  b = await createWine(db, parseWineInput({ name: "B", price: "10" }, regionId), 2, null);
});
const stockOf = async (id: number) => (await db.select().from(wines).where(eq(wines.id, id)))[0].stock;

test("perda baixa o estoque sem ser venda", async () => {
  expect(await applyMovement(db, { wineId: a, type: "perda", qty: 1, userId: null })).toBe(9);
  const types = (await db.select().from(stockMovements).where(eq(stockMovements.wineId, a))).map((m) => m.type);
  expect(types).toEqual(["entrada", "perda"]);
});

test("balanço só mexe onde a contagem difere", async () => {
  expect(await applyCounts(db, [{ wineId: a, counted: 9 }, { wineId: b, counted: 5 }], "Balanço", null)).toEqual({ changed: 1, diff: 3 });
  expect(await stockOf(b)).toBe(5);
});

test("evento: sem estoque não conclui nem baixa nada", async () => {
  const [{ id }] = await db.insert(events).values({ name: "Degustação", day: "2026-11-20" }).returning();
  await db.insert(eventWines).values([{ eventId: id, wineId: a, qty: 2 }, { eventId: id, wineId: b, qty: 99 }]);
  await expect(concludeEvent(db, id, null)).rejects.toThrow("insuficiente");
  expect(await stockOf(a)).toBe(9);
  await db.update(eventWines).set({ qty: 1 }).where(eq(eventWines.wineId, b));
  await concludeEvent(db, id, null);
  expect([await stockOf(a), await stockOf(b)]).toEqual([7, 4]);
  await expect(concludeEvent(db, id, null)).rejects.toThrow("já foi encerrado");
});
