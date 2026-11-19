import type { Currency } from "../db/schema.ts";
import type { Rates } from "./money.ts";

/**
 * Totais de uma venda, em centavos de dólar. O preço de prateleira já inclui o IVA;
 * turista estrangeiro paga o valor sem ele. Usado igual no caixa (tela) e no servidor.
 */
export function saleTotals(subtotal: number, discountPercent: number, tourist: boolean, ivaPercent: number) {
  const discount = Math.round((subtotal * discountPercent) / 100);
  const gross = subtotal - discount;
  const net = Math.round(gross / (1 + ivaPercent / 100));
  return { discount, tax: tourist ? 0 : gross - net, exempt: tourist ? gross - net : 0, total: tourist ? net : gross };
}

/** Centavos de dólar -> centavos da moeda paga. */
export const inCurrency = (usdCents: number, currency: Currency, rates: Rates) =>
  currency === "USD" ? usdCents : Math.round(usdCents * (currency === "PYG" ? rates.pyg : rates.brl));

export const formatIn = (cents: number, currency: Currency) =>
  currency === "PYG" ? "₲ " + Math.round(cents / 100).toLocaleString("pt-BR")
    : (cents / 100).toLocaleString("pt-BR", { style: "currency", currency });

/** Centavos da moeda paga -> centavos de dólar (para mostrar o troco nas três moedas). */
export const toUsd = (cents: number, currency: Currency, rates: Rates) =>
  currency === "USD" ? cents : Math.round(cents / (currency === "PYG" ? rates.pyg : rates.brl));
