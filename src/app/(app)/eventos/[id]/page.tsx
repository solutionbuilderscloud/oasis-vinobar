import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { addEventWine, cancelEvent, concludeEvent, removeEventWine, updateEvent } from "@/app/actions-gestao";
import { Gauge } from "@/components/charts";
import { Flash } from "@/components/ui";
import { db } from "@/db";
import { eventWines, events, wines } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDay } from "@/lib/dates";
import { usd } from "@/lib/money";

// lê a URL a cada acesso; navegação resolve no servidor
export const instant = false;

export default async function Evento({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser("admin", "gerente");
  const id = Number((await params).id);
  const [event] = Number.isInteger(id) ? await db.select().from(events).where(eq(events.id, id)) : [];
  if (!event) notFound();
  const [served, catalog] = await Promise.all([
    db.select({ row: eventWines, w: wines }).from(eventWines).innerJoin(wines, eq(wines.id, eventWines.wineId)).where(eq(eventWines.eventId, id)),
    db.select().from(wines).where(eq(wines.active, true)).orderBy(wines.name),
  ]);
  const open = event.status === "planejado";
  const revenue = event.ticketsSold * event.ticketCents;
  const cost = served.reduce((t, s) => t + s.row.qty * s.w.costCents, 0);
  const bottles = served.reduce((t, s) => t + s.row.qty, 0);
  const short = served.filter((s) => s.row.qty > s.w.stock);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <p className="text-sm text-muted first-letter:uppercase">{formatDay(event.day, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}{event.time && ` · ${event.time}`}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{event.name} <span className={`${open ? "badge-gold" : "badge"} ml-2 align-middle capitalize`}>{event.status}</span></h1>
        </div>
        <Link className="btn-ghost" href="/eventos">Todos os eventos</Link>
      </div>
      <Flash sp={await searchParams} />

      <div className="grid gap-4 xl:grid-cols-12">
        <section className="card lift xl:col-span-8">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="tile"><p className="text-sm text-muted">Ingressos</p><p className="num mt-1 text-3xl">{usd(revenue)}</p><p className="text-xs text-muted">{event.ticketsSold} × {usd(event.ticketCents)}</p></div>
            <div className="tile"><p className="text-sm text-muted">Vinhos servidos</p><p className="num mt-1 text-3xl">{usd(cost)}</p><p className="text-xs text-muted">{bottles} garrafas, a custo</p></div>
            <div className="tile"><p className="text-sm text-muted">Lucro {open && "previsto"}</p><p className={`num mt-1 text-3xl ${revenue - cost >= 0 ? "text-gold" : ""}`}>{revenue - cost < 0 && "− "}{usd(Math.abs(revenue - cost))}</p><p className="text-xs text-muted">ingressos menos vinhos</p></div>
            <div className="tile"><p className="text-sm text-muted">Vinho por pessoa</p><p className="num mt-1 text-3xl">{event.ticketsSold ? usd(Math.round(cost / event.ticketsSold)) : "—"}</p><p className="text-xs text-muted">{event.ticketsSold ? `${(bottles / event.ticketsSold).toFixed(2)} garrafa por pessoa` : "sem ingressos vendidos"}</p></div>
          </div>

          <h2 className="mb-3 mt-6 font-semibold tracking-tight">Vinhos do evento</h2>
          {short.length > 0 && open && (
            <p role="alert" className="mb-3 rounded-2xl bg-wine px-4 py-3 text-sm text-white">
              Estoque insuficiente para: {short.map((s) => `${s.w.name} (precisa ${s.row.qty}, há ${s.w.stock})`).join("; ")}. O evento não conclui enquanto faltar.
            </p>
          )}
          {served.length === 0 ? <p className="text-sm text-muted">Nenhum vinho escolhido ainda.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr><th className="th">Vinho</th><th className="th text-right">Garrafas</th><th className="th text-right">Em estoque</th><th className="th text-right">Custo</th>{open && <th className="th" />}</tr></thead>
                <tbody>
                  {served.map(({ row, w }) => (
                    <tr key={row.id}>
                      <td className="td"><Link href={`/estoque/${w.id}`} className="font-medium hover:underline">{w.name} {w.vintage ?? ""}</Link><span className="block text-xs text-muted">{w.producer}</span></td>
                      <td className="td num text-right">{row.qty}</td>
                      <td className={`td text-right tabular-nums ${open && row.qty > w.stock ? "font-semibold text-gold" : "text-muted"}`}>{w.stock}</td>
                      <td className="td text-right tabular-nums">{usd(row.qty * w.costCents)}</td>
                      {open && (
                        <td className="td text-right">
                          <form action={removeEventWine}><input type="hidden" name="eventId" value={id} /><input type="hidden" name="id" value={row.id} />
                            <button className="text-xs text-muted underline underline-offset-2 hover:text-fg" aria-label={`Tirar ${w.name} do evento`}>Tirar</button>
                          </form>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {open && (
            <form action={addEventWine} className="mt-4 flex flex-wrap items-end gap-2">
              <input type="hidden" name="eventId" value={id} />
              <div className="min-w-56 flex-1">
                <label className="label" htmlFor="wineId">Adicionar vinho</label>
                <select className="input" id="wineId" name="wineId" required defaultValue="">
                  <option value="" disabled>Escolha…</option>
                  {catalog.map((w) => <option key={w.id} value={w.id}>{w.name} {w.vintage ?? ""} · {w.stock} em estoque</option>)}
                </select>
              </div>
              <div><label className="label" htmlFor="qty">Garrafas</label><input className="input w-24" id="qty" name="qty" type="number" min={1} defaultValue={1} required /></div>
              <button className="btn">Adicionar</button>
            </form>
          )}
        </section>

        <div className="space-y-4 xl:col-span-4">
          <section className="card lift">
            <h2 className="mb-2 font-semibold tracking-tight">Ocupação</h2>
            {event.capacity > 0
              ? <><Gauge value={(event.ticketsSold / event.capacity) * 100} caption="das vagas" /><p className="mt-2 text-center text-xs text-muted">{event.ticketsSold} de {event.capacity} vagas</p></>
              : <p className="text-sm text-muted">Sem limite de vagas definido.</p>}
          </section>

          {open ? (
            <>
              <form action={updateEvent} className="card space-y-3">
                <h2 className="font-semibold tracking-tight">Dados do evento</h2>
                <input type="hidden" name="id" value={id} />
                <div><label className="label" htmlFor="name">Nome</label><input className="input" id="name" name="name" defaultValue={event.name} required /></div>
                <div className="flex gap-2">
                  <div className="flex-1"><label className="label" htmlFor="day">Data</label><input className="input" id="day" name="day" type="date" defaultValue={event.day} required /></div>
                  <div><label className="label" htmlFor="time">Hora</label><input className="input" id="time" name="time" type="time" defaultValue={event.time} /></div>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1"><label className="label" htmlFor="capacity">Vagas</label><input className="input" id="capacity" name="capacity" type="number" min={0} defaultValue={event.capacity} /></div>
                  <div className="flex-1"><label className="label" htmlFor="ticketsSold">Vendidos</label><input className="input" id="ticketsSold" name="ticketsSold" type="number" min={0} defaultValue={event.ticketsSold} /></div>
                </div>
                <div><label className="label" htmlFor="ticket">Ingresso (US$)</label><input className="input" id="ticket" name="ticket" inputMode="decimal" defaultValue={(event.ticketCents / 100).toFixed(2)} /></div>
                <div><label className="label" htmlFor="notes">Observações</label><input className="input" id="notes" name="notes" defaultValue={event.notes} /></div>
                <button className="btn w-full">Salvar</button>
              </form>
              <section className="card space-y-2">
                <h2 className="font-semibold tracking-tight">Encerrar</h2>
                <p className="text-xs text-muted">Concluir baixa as {bottles} garrafas do estoque e não pode ser desfeito por aqui.</p>
                <form action={concludeEvent}><input type="hidden" name="id" value={id} /><button className="btn w-full">Concluir evento e baixar estoque</button></form>
                <form action={cancelEvent}><input type="hidden" name="id" value={id} /><button className="btn-ghost w-full">Cancelar evento</button></form>
              </section>
            </>
          ) : (
            <section className="card text-sm text-muted">
              {event.status === "realizado" ? "Evento concluído. Os vinhos já saíram do estoque." : "Evento cancelado. Nada saiu do estoque."}
              {event.notes && <p className="mt-2 text-fg">{event.notes}</p>}
            </section>
          )}
        </div>
      </div>
    </>
  );
}
