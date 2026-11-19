import { eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { eventWines, events } from "../db/schema.ts";
import { move, UserError } from "./stock.ts";

/** Conclui o evento e baixa do estoque os vinhos servidos. Tudo ou nada: falta de estoque cancela tudo. */
export const concludeEvent = (db: Db, eventId: number, userId: number | null) =>
  db.transaction(async (tx) => {
    const [event] = await tx.select().from(events).where(eq(events.id, eventId));
    if (!event) throw new UserError("Evento não encontrado");
    if (event.status !== "planejado") throw new UserError("Este evento já foi encerrado");
    for (const w of await tx.select().from(eventWines).where(eq(eventWines.eventId, eventId)))
      await move(tx, { wineId: w.wineId, type: "evento", qty: w.qty, note: `Evento: ${event.name}`, userId });
    await tx.update(events).set({ status: "realizado" }).where(eq(events.id, eventId));
  });
