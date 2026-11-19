import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, expect, test } from "vitest";
import { createDb, type Db } from "../db/client.ts";
import { regions, stockMovements, users, wines } from "../db/schema.ts";
import { cancelSale, createSale, type SaleInput } from "./checkout.ts";
import { inCurrency, saleTotals } from "./sale-math.ts";
import { createWine, parseWineInput } from "./stock.ts";

let db: Db;
let a: number, b: number;
const env = { ivaPercent: 10, rates: { pyg: 7500, brl: 5.5 } };
const base: Omit<SaleInput, "items"> = { register: 1, tourist: false, discountPercent: 0, currency: "USD", method: "dinheiro", customerId: null };
const stockOf = async (id: number) => (await db.select().from(wines).where(eq(wines.id, id)))[0].stock;

beforeAll(async () => {
  db = createDb(`file:${join(mkdtempSync(join(tmpdir(), "oasis-")), "t.db")}`);
  await migrate(db, { migrationsFolder: "./drizzle" });
  const [{ id: regionId }] = await db.insert(regions).values({ name: "Chile" }).returning();
  a = await createWine(db, parseWineInput({ name: "A", price: "110", cost: "60" }, regionId), 10, null);
  b = await createWine(db, parseWineInput({ name: "B", price: "22", cost: "10" }, regionId), 5, null);
});

test("saleTotals: IVA embutido, turista sem IVA, desconto antes", () => {
  expect(saleTotals(11000, 0, false, 10)).toEqual({ discount: 0, tax: 1000, exempt: 0, total: 11000 });
  expect(saleTotals(11000, 0, true, 10)).toEqual({ discount: 0, tax: 0, exempt: 1000, total: 10000 });
  expect(saleTotals(11000, 10, true, 10).total).toBe(9000);
  expect(inCurrency(10000, "PYG", env.rates)).toBe(75000000);
  expect(inCurrency(10000, "BRL", env.rates)).toBe(55000);
});

test("venda baixa estoque e grava o valor pago por garrafa", async () => {
  const sale = await createSale(db, { ...base, items: [{ wineId: a, qty: 2 }, { wineId: b, qty: 1 }], tourist: true, currency: "BRL" }, env, null);
  expect(sale.subtotalCents).toBe(24200);
  expect(sale.totalCents).toBe(22000);
  expect(sale.paidCents).toBe(121000);
  expect(await stockOf(a)).toBe(8);
  const moves = await db.select().from(stockMovements).where(eq(stockMovements.saleId, sale.id));
  expect(moves.map((m) => [m.delta, m.unitPriceCents, m.unitCostCents])).toEqual([[-2, 10000, 6000], [-1, 2000, 1000]]);
});

test("sem estoque: nada é gravado", async () => {
  await expect(createSale(db, { ...base, items: [{ wineId: a, qty: 1 }, { wineId: b, qty: 99 }] }, env, null)).rejects.toThrow("estoque insuficiente");
  expect(await stockOf(a)).toBe(8);
  await expect(createSale(db, { ...base, items: [] }, env, null)).rejects.toThrow("Carrinho vazio");
  await expect(createSale(db, { ...base, items: [{ wineId: a, qty: 1 }], register: 9 }, env, null)).rejects.toThrow("Caixa inválido");
  await expect(createSale(db, { ...base, items: [{ wineId: a, qty: 1 }, { wineId: a, qty: 1 }] }, env, null)).rejects.toThrow("repetido");
});

test("estorno devolve o estoque, uma vez só", async () => {
  const sale = await createSale(db, { ...base, items: [{ wineId: b, qty: 2 }] }, env, null);
  expect(await stockOf(b)).toBe(2);
  await cancelSale(db, sale.id, null);
  expect(await stockOf(b)).toBe(4);
  await expect(cancelSale(db, sale.id, null)).rejects.toThrow("já estornada");
});

test("desconto, bonificação e permuta só com responsável", async () => {
  const item = [{ wineId: a, qty: 1 }];
  await expect(createSale(db, { ...base, items: item, discountPercent: 5 }, env, null)).rejects.toThrow("senha de um responsável");
  await expect(createSale(db, { ...base, items: item, kind: "bonificação", note: "cortesia" }, env, null)).rejects.toThrow("senha de um responsável");
  await expect(createSale(db, { ...base, items: item, kind: "bonificação" }, env, null, 1)).rejects.toThrow("motivo");
  await expect(createSale(db, { ...base, items: item, kind: "permuta", note: "fotos" }, env, null, 1)).rejects.toThrow("cliente cadastrado");
  await expect(createSale(db, { ...base, items: item, discountPercent: 100 }, env, null, 1)).rejects.toThrow("use bonificação");
});

test("bonificação baixa estoque, não cobra e não é venda", async () => {
  const [u] = await db.insert(users).values({ name: "Chefe", email: "c@x", passwordHash: "x", role: "gerente" }).returning();
  const before = await stockOf(a);
  const sale = await createSale(db, { ...base, items: [{ wineId: a, qty: 1 }], kind: "bonificação", note: "cliente antigo", tourist: true }, env, null, u.id);
  expect([sale.totalCents, sale.paidCents, sale.subtotalCents, sale.tourist, sale.authorizedBy]).toEqual([0, 0, 11000, false, u.id]);
  expect(await stockOf(a)).toBe(before - 1);
  const [m] = await db.select().from(stockMovements).where(eq(stockMovements.saleId, sale.id));
  expect(m.type).toBe("bonificação");
});
