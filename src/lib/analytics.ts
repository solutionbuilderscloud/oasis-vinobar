import type { Currency } from "../db/schema.ts";
import type { Rates } from "./money.ts";

/** Curva ABC: A = rótulos que somam até 80% do faturamento, B até 95%, C o resto. Sem venda é C. */
export function abcClasses(items: { id: number; revenue: number }[]) {
  const total = items.reduce((s, i) => s + i.revenue, 0);
  const out = new Map<number, "A" | "B" | "C">();
  let cum = 0;
  for (const i of [...items].sort((a, b) => b.revenue - a.revenue)) {
    // classifica pelo acumulado ANTES do item, para o campeão de vendas ser sempre A
    out.set(i.id, !total || !i.revenue ? "C" : cum / total < 0.8 ? "A" : cum / total < 0.95 ? "B" : "C");
    cum += i.revenue;
  }
  return out;
}

/**
 * Reposição. Ponto de pedido = venda diária × (prazo de entrega + segurança), nunca abaixo do mínimo cadastrado.
 * Ao chegar no ponto, sugere pedir o bastante para cobrir mais `coverDays` depois da entrega.
 */
export function reorder(p: { stock: number; dailyRate: number; leadDays: number; safetyDays: number; minStock: number; coverDays?: number }) {
  const point = Math.max(p.minStock, Math.ceil(p.dailyRate * (p.leadDays + p.safetyDays)));
  const target = point + Math.ceil(p.dailyRate * (p.coverDays ?? 30));
  return {
    point,
    suggest: p.stock <= point ? Math.max(0, target - p.stock) : 0,
    coverage: p.dailyRate > 0 ? Math.round(p.stock / p.dailyRate) : null,
  };
}

/** Converte um valor em centavos da moeda original para centavos de dólar. */
export function toUsdCents(amountCents: number, currency: Currency, rates: Rates) {
  const rate = currency === "USD" ? 1 : currency === "PYG" ? rates.pyg : rates.brl;
  return rate > 0 ? Math.round(amountCents / rate) : 0;
}

/** Quanto é preciso vender para pagar as despesas, dada a margem bruta (0 a 1). null se a margem não é positiva. */
export const breakEven = (expensesCents: number, grossMargin: number) =>
  grossMargin > 0 ? Math.round(expensesCents / grossMargin) : null;
