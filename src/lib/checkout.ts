import { eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { CURRENCIES, type Currency, customers, PAYMENT_METHODS, type PaymentMethod, REGISTERS, SALE_KINDS, type SaleKind, saleItems, sales, wines } from "../db/schema.ts";
import { todayKey } from "./dates.ts";
import type { Rates } from "./money.ts";
import { inCurrency, saleTotals } from "./sale-math.ts";
import { move, UserError } from "./stock.ts";

export type SaleInput = {
  items: { wineId: number; qty: number }[];
  register: number; tourist: boolean; discountPercent: number;
  currency: Currency; method: PaymentMethod; customerId: number | null;
  kind?: SaleKind; note?: string;
};

/**
 * Fecha uma venda: grava a venda e os itens e baixa o estoque, tudo ou nada.
 * Preço e custo vêm sempre do banco, nunca da tela.
 * Desconto, bonificação e permuta só passam com um responsável (authorizedBy), que quem chama já validou pela senha.
 */
export const createSale = (db: Db, input: SaleInput, env: { ivaPercent: number; rates: Rates }, userId: number | null, authorizedBy: number | null = null) =>
  db.transaction(async (tx) => {
    const kind = input.kind ?? "venda", note = (input.note ?? "").trim(), free = kind !== "venda";
    if (!SALE_KINDS.includes(kind)) throw new UserError("Tipo de saída inválido");
    if ((free || input.discountPercent > 0) && authorizedBy === null) throw new UserError("Desconto, bonificação e permuta precisam da senha de um responsável");
    if (free && !note) throw new UserError("Informe o motivo");
    if (kind === "permuta" && input.customerId === null) throw new UserError("Permuta precisa de um cliente cadastrado");
    if (!Array.isArray(input.items) || input.items.length === 0) throw new UserError("Carrinho vazio");
    if (!(REGISTERS as readonly number[]).includes(input.register)) throw new UserError("Caixa inválido");
    if (!CURRENCIES.includes(input.currency)) throw new UserError("Moeda inválida");
    if (!PAYMENT_METHODS.includes(input.method)) throw new UserError("Forma de pagamento inválida");
    if (!(input.discountPercent >= 0 && input.discountPercent <= 100)) throw new UserError("Desconto inválido");
    if (input.items.some((i) => !Number.isInteger(i.wineId) || !Number.isInteger(i.qty) || i.qty <= 0)) throw new UserError("Quantidade inválida");
    if (new Set(input.items.map((i) => i.wineId)).size !== input.items.length) throw new UserError("Vinho repetido no carrinho");
    if (input.customerId !== null && (await tx.select({ id: customers.id }).from(customers).where(eq(customers.id, input.customerId))).length === 0)
      throw new UserError("Cliente não encontrado");

    const found = await tx.select().from(wines).where(inArray(wines.id, input.items.map((i) => i.wineId)));
    const lines = input.items.map((i) => {
      const wine = found.find((w) => w.id === i.wineId);
      if (!wine || !wine.active) throw new UserError("Vinho não encontrado");
      if (wine.stock < i.qty) throw new UserError(`${wine.name}: estoque insuficiente (há ${wine.stock})`);
      return { ...i, wine };
    });
    const subtotal = lines.reduce((s, l) => s + l.qty * l.wine.priceCents, 0);
    // bonificação e permuta não cobram nada: o valor de prateleira fica no subtotal, para o painel
    const t = free ? { discount: 0, tax: 0, exempt: 0, total: 0 } : saleTotals(subtotal, input.discountPercent, Boolean(input.tourist), env.ivaPercent);
    const paidCents = inCurrency(t.total, input.currency, env.rates);
    if (!free && t.total <= 0) throw new UserError("Venda sem valor: para dar a garrafa, use bonificação");
    if (!free && paidCents <= 0) throw new UserError("Câmbio não configurado para essa moeda");

    const [sale] = await tx.insert(sales).values({
      day: todayKey(), register: input.register, userId, customerId: input.customerId, tourist: !free && Boolean(input.tourist),
      method: input.method, currency: input.currency, subtotalCents: subtotal, discountCents: t.discount, taxCents: t.tax,
      totalCents: t.total, paidCents, kind, note, authorizedBy,
    }).returning();
    for (const l of lines) {
      await tx.insert(saleItems).values({ saleId: sale.id, wineId: l.wineId, qty: l.qty, priceCents: l.wine.priceCents, costCents: l.wine.costCents });
      await move(tx, {
        wineId: l.wineId, type: free ? kind : "saida", qty: l.qty, note: free ? `${kind} nº ${sale.id}: ${note}` : `Venda nº ${sale.id}`, userId, saleId: sale.id,
        // desconto e isenção de IVA rateados por garrafa, para o lucro bater com o que entrou
        unitPriceCents: subtotal ? Math.round((l.wine.priceCents * t.total) / subtotal) : 0, unitCostCents: l.wine.costCents,
      });
    }
    return sale;
  });

/** Estorno: devolve as garrafas ao estoque e tira a venda dos relatórios. */
export const cancelSale = (db: Db, saleId: number, userId: number | null) =>
  db.transaction(async (tx) => {
    const [sale] = await tx.select().from(sales).where(eq(sales.id, saleId));
    if (!sale) throw new UserError("Venda não encontrada");
    if (sale.status !== "concluida") throw new UserError("Venda já estornada");
    for (const i of await tx.select().from(saleItems).where(eq(saleItems.saleId, saleId)))
      await move(tx, { wineId: i.wineId, type: "entrada", qty: i.qty, note: `Estorno da venda nº ${saleId}`, userId });
    await tx.update(sales).set({ status: "cancelada" }).where(eq(sales.id, saleId));
  });

