import "server-only";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { regions, sales, stockMovements, wines } from "@/db/schema";
import { dayKey, utcBounds } from "./dates";

/**
 * Vendas entre dois dias (inclusive), uma linha por saída de estoque.
 * Venda do caixa usa o valor pago e o custo gravados na hora; saída manual antiga cai no preço e custo atuais do vinho.
 * Vendas estornadas ficam de fora.
 */
export async function getSales(from: string, to: string) {
  const [lo, hi] = utcBounds(from, to);
  const rows = await db.select({
    delta: stockMovements.delta, at: stockMovements.createdAt, wineId: wines.id, wine: wines.name, producer: wines.producer,
    type: wines.type, region: regions.name, status: sales.status,
    price: sql<number>`coalesce(${stockMovements.unitPriceCents}, ${wines.priceCents})`,
    cost: sql<number>`coalesce(${stockMovements.unitCostCents}, ${wines.costCents})`,
  }).from(stockMovements).innerJoin(wines, eq(wines.id, stockMovements.wineId)).innerJoin(regions, eq(regions.id, wines.regionId))
    .leftJoin(sales, eq(sales.id, stockMovements.saleId))
    .where(and(eq(stockMovements.type, "saida"), gte(stockMovements.createdAt, lo), lte(stockMovements.createdAt, hi)));
  return rows
    .filter((s) => s.status !== "cancelada")
    .map((s) => ({ ...s, key: dayKey(s.at), qty: -s.delta, revenue: -s.delta * s.price, cogs: -s.delta * s.cost, profit: -s.delta * (s.price - s.cost) }))
    .filter((s) => s.key >= from && s.key <= to);
}
