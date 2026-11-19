"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { CURRENCIES, type Currency, EXPENSE_CATEGORIES, eventWines, events, expenses, wines } from "@/db/schema";
import { attempt, fail, str } from "@/lib/action-helpers";
import { toUsdCents } from "@/lib/analytics";
import { requireUser } from "@/lib/auth";
import { getRates } from "@/lib/data";
import { isDayKey, todayKey } from "@/lib/dates";
import { concludeEvent as conclude } from "@/lib/events";
import { parseMoney } from "@/lib/money";
import { applyCounts } from "@/lib/stock";

const whole = (s: string) => (/^\d+$/.test(s) ? Number(s) : NaN);

export async function applyCount(f: FormData) {
  const user = await requireUser("admin", "gerente");
  const counts: { wineId: number; counted: number }[] = [];
  for (const [k, v] of f.entries()) {
    if (!k.startsWith("c_") || String(v).trim() === "") continue;
    const counted = whole(String(v).trim());
    if (Number.isNaN(counted)) fail("/estoque/balanco", "Contagem inválida: use números inteiros");
    counts.push({ wineId: Number(k.slice(2)), counted });
  }
  if (counts.length === 0) fail("/estoque/balanco", "Nenhuma contagem preenchida");
  const r = await attempt("/estoque/balanco", () => applyCounts(db, counts, `Balanço ${todayKey()}`, user.id));
  redirect(`/estoque/balanco?ok=${encodeURIComponent(`${counts.length} rótulos contados, ${r.changed} ajustados, diferença de ${r.diff > 0 ? "+" : ""}${r.diff} garrafas`)}`);
}

export async function addExpense(f: FormData) {
  const user = await requireUser("admin", "gerente");
  const day = str(f, "day");
  const back = `/despesas?mes=${isDayKey(day) ? day.slice(0, 7) : ""}`;
  const category = str(f, "category") as (typeof EXPENSE_CATEGORIES)[number];
  const currency = str(f, "currency") as Currency;
  const amountCents = parseMoney(str(f, "amount"));
  if (!isDayKey(day)) fail("/despesas", "Data inválida");
  if (!EXPENSE_CATEGORIES.includes(category)) fail(back, "Categoria inválida");
  if (!CURRENCIES.includes(currency)) fail(back, "Moeda inválida");
  if (amountCents === null || amountCents <= 0) fail(back, "Valor inválido");
  const usdCents = toUsdCents(amountCents, currency, await getRates());
  if (usdCents <= 0) fail(back, "Câmbio não configurado para essa moeda");
  await db.insert(expenses).values({ day, category, currency, amountCents, usdCents, description: str(f, "description"), userId: user.id });
  redirect(back);
}

export async function deleteExpense(f: FormData) {
  await requireUser("admin", "gerente");
  await db.delete(expenses).where(eq(expenses.id, Number(str(f, "id"))));
  redirect(`/despesas?mes=${str(f, "mes")}`);
}

function eventFields(f: FormData, back: string) {
  const name = str(f, "name");
  const day = str(f, "day");
  const capacity = whole(str(f, "capacity") || "0");
  const ticketsSold = whole(str(f, "ticketsSold") || "0");
  const ticketCents = str(f, "ticket") ? parseMoney(str(f, "ticket")) : 0;
  if (!name) fail(back, "Nome é obrigatório");
  if (!isDayKey(day)) fail(back, "Data inválida");
  if (Number.isNaN(capacity) || Number.isNaN(ticketsSold)) fail(back, "Vagas e ingressos precisam ser números inteiros");
  if (ticketCents === null) fail(back, "Preço do ingresso inválido");
  if (capacity > 0 && ticketsSold > capacity) fail(back, "Ingressos vendidos passam do número de vagas");
  return { name, day, capacity, ticketsSold, ticketCents: ticketCents as number, time: str(f, "time"), notes: str(f, "notes") };
}

export async function createEvent(f: FormData) {
  await requireUser("admin", "gerente");
  const [row] = await db.insert(events).values(eventFields(f, "/eventos")).returning({ id: events.id });
  redirect(`/eventos/${row.id}`);
}

export async function updateEvent(f: FormData) {
  await requireUser("admin", "gerente");
  const id = Number(str(f, "id"));
  await db.update(events).set(eventFields(f, `/eventos/${id}`)).where(eq(events.id, id));
  redirect(`/eventos/${id}?ok=Evento+salvo`);
}

async function planned(id: number) {
  const [event] = await db.select().from(events).where(eq(events.id, id));
  if (!event || event.status !== "planejado") fail(`/eventos/${id}`, "Este evento já foi encerrado");
}

export async function addEventWine(f: FormData) {
  await requireUser("admin", "gerente");
  const eventId = Number(str(f, "eventId"));
  const back = `/eventos/${eventId}`;
  await planned(eventId);
  const wineId = Number(str(f, "wineId"));
  const qty = whole(str(f, "qty"));
  if (!(qty > 0)) fail(back, "Quantidade inválida");
  const [wine] = await db.select({ id: wines.id }).from(wines).where(eq(wines.id, wineId));
  if (!wine) fail(back, "Escolha um vinho");
  const [existing] = await db.select().from(eventWines).where(and(eq(eventWines.eventId, eventId), eq(eventWines.wineId, wineId)));
  if (existing) await db.update(eventWines).set({ qty: existing.qty + qty }).where(eq(eventWines.id, existing.id));
  else await db.insert(eventWines).values({ eventId, wineId, qty });
  redirect(back);
}

export async function removeEventWine(f: FormData) {
  await requireUser("admin", "gerente");
  const eventId = Number(str(f, "eventId"));
  await planned(eventId);
  await db.delete(eventWines).where(and(eq(eventWines.id, Number(str(f, "id"))), eq(eventWines.eventId, eventId)));
  redirect(`/eventos/${eventId}`);
}

export async function concludeEvent(f: FormData) {
  const user = await requireUser("admin", "gerente");
  const id = Number(str(f, "id"));
  await attempt(`/eventos/${id}`, () => conclude(db, id, user.id));
  redirect(`/eventos/${id}?ok=${encodeURIComponent("Evento concluído e estoque baixado")}`);
}

export async function cancelEvent(f: FormData) {
  await requireUser("admin", "gerente");
  const id = Number(str(f, "id"));
  await planned(id);
  await db.update(events).set({ status: "cancelado" }).where(eq(events.id, id));
  redirect(`/eventos/${id}`);
}
