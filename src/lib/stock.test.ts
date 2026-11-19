import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, expect, test } from "vitest";
import { createDb, type Db } from "../db/client.ts";
import { regions, stockMovements, wines } from "../db/schema.ts";
import { parseCsv } from "./csv.ts";
import { parseMoney } from "./money.ts";
import { applyMovement, createWine, createWines, parseWineInput } from "./stock.ts";

let db: Db;
let regionId: number;
beforeAll(async () => {
  db = createDb(`file:${join(mkdtempSync(join(tmpdir(), "oasis-")), "t.db")}`);
  await migrate(db, { migrationsFolder: "./drizzle" });
  [{ id: regionId }] = await db.insert(regions).values({ name: "Itália" }).returning();
});

const wine = (over = {}) => parseWineInput({ name: "Barolo", price: "89,90", ...over }, regionId);
const stockOf = async (id: number) => (await db.select().from(wines).where(eq(wines.id, id)))[0].stock;

test("parseMoney", () => {
  expect(parseMoney("89,90")).toBe(8990);
  expect(parseMoney("89.9")).toBe(8990);
  expect(parseMoney("US$ 1.234,56")).toBe(123456);
  expect(parseMoney("1,234.56")).toBe(123456);
  expect(parseMoney("1.500")).toBe(150000);
  expect(parseMoney("120")).toBe(12000);
  expect(parseMoney("abc")).toBeNull();
});

test("parseCsv: ponto e vírgula, aspas, BOM, linhas vazias", () => {
  expect(parseCsv('﻿nome;preco\r\n"Tinto; Reserva";"12,50"\r\n\r\n')).toEqual([["nome", "preco"], ["Tinto; Reserva", "12,50"]]);
  expect(parseCsv('a,b\n"diz ""oi""",2')).toEqual([["a", "b"], ['diz "oi"', "2"]]);
});

test("entrada, saída, ajuste e histórico", async () => {
  const id = await createWine(db, wine(), 10, null);
  expect(await stockOf(id)).toBe(10);
  expect(await applyMovement(db, { wineId: id, type: "saida", qty: 3, userId: null })).toBe(7);
  expect(await applyMovement(db, { wineId: id, type: "ajuste", qty: 5, userId: null })).toBe(5);
  await expect(applyMovement(db, { wineId: id, type: "saida", qty: 6, userId: null })).rejects.toThrow("insuficiente");
  await expect(applyMovement(db, { wineId: id, type: "entrada", qty: 1.5, userId: null })).rejects.toThrow("inválida");
  expect(await stockOf(id)).toBe(5);
  const deltas = (await db.select().from(stockMovements).where(eq(stockMovements.wineId, id))).map((m) => m.delta);
  expect(deltas).toEqual([10, -3, -2]);
});

test("número de item sequencial e código de barras único", async () => {
  const a = await createWine(db, wine({ barcode: "789" }), 0, null);
  const b = await createWine(db, wine(), 0, null);
  const [ra] = await db.select().from(wines).where(eq(wines.id, a));
  const [rb] = await db.select().from(wines).where(eq(wines.id, b));
  expect(rb.itemNumber).toBe(ra.itemNumber + 1);
  await expect(createWine(db, wine({ barcode: "789" }), 0, null)).rejects.toThrow("já pertence");
});

test("importação é tudo ou nada", async () => {
  const before = (await db.select().from(wines)).length;
  await expect(
    createWines(db, [{ input: wine({ barcode: "111" }), stock: 2 }, { input: wine({ barcode: "111" }), stock: 2 }], null),
  ).rejects.toThrow();
  expect((await db.select().from(wines)).length).toBe(before);
});

test("validação de vinho", () => {
  expect(() => wine({ price: "0" })).toThrow("Preço");
  expect(() => wine({ vintage: "20" })).toThrow("Safra");
  expect(() => wine({ type: "cerveja" })).toThrow("Tipo");
  expect(wine({ vintage: "NV" }).vintage).toBeNull();
  expect(() => parseWineInput({ name: "X", price: "10", region: "Marte" }, undefined)).toThrow("Região");
});
