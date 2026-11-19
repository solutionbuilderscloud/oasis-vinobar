import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { createEvent } from "@/app/actions-gestao";
import { Flash } from "@/components/ui";
import { db } from "@/db";
import { eventWines, events, wines } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDay, todayKey } from "@/lib/dates";
import { usd } from "@/lib/money";

const TONE = { planejado: "badge-gold", realizado: "badge", cancelado: "badge" };

// lê a URL a cada acesso; navegação resolve no servidor
export const instant = false;

export default async function Eventos({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser("admin", "gerente");
  await connection();
  const today = todayKey();
  const [list, served] = await Promise.all([
    db.select().from(events).orderBy(desc(events.day)),
    db.select({ eventId: eventWines.eventId, qty: eventWines.qty, cost: wines.costCents }).from(eventWines).innerJoin(wines, eq(wines.id, eventWines.wineId)),
  ]);
  const cards = list.map((e) => {
    const mine = served.filter((s) => s.eventId === e.id);
    const revenue = e.ticketsSold * e.ticketCents, cost = mine.reduce((t, s) => t + s.qty * s.cost, 0);
    return { ...e, revenue, cost, bottles: mine.reduce((t, s) => t + s.qty, 0) };
  });
  const upcoming = cards.filter((e) => e.status === "planejado").reverse();
  const past = cards.filter((e) => e.status !== "planejado");
  const done = cards.filter((e) => e.status === "realizado");

  const Card = ({ e }: { e: (typeof cards)[number] }) => (
    <Link href={`/eventos/${e.id}`} className="card lift block">
      <div className="flex items-start justify-between gap-3">
        <div className="tile !p-2 text-center leading-none">
          <span className="num block text-2xl">{e.day.slice(8)}</span>
          <span className="text-[10px] uppercase tracking-widest text-muted">{formatDay(e.day, { month: "short" }).replace(".", "")}</span>
        </div>
        <span className={`${TONE[e.status]} capitalize`}>{e.status}</span>
      </div>
      <h3 className="mt-3 text-lg font-semibold tracking-tight">{e.name}</h3>
      <p className="text-xs text-muted first-letter:uppercase">{formatDay(e.day, { weekday: "long" })}{e.time && ` · ${e.time}`}</p>
      <div className="mt-4 h-1.5 rounded-full bg-fg/10"><div className="grow-x h-full rounded-full bg-gradient-to-r from-gold/30 to-gold" style={{ width: `${e.capacity ? Math.min(100, (e.ticketsSold / e.capacity) * 100) : 0}%` }} /></div>
      <p className="mt-1 text-xs text-muted">{e.ticketsSold}{e.capacity > 0 && ` de ${e.capacity}`} ingressos · {e.bottles} garrafas</p>
      <p className="mt-3 flex items-baseline justify-between"><span className="text-xs text-muted">Lucro {e.status === "planejado" ? "previsto" : ""}</span><span className="num text-xl">{usd(e.revenue - e.cost)}</span></p>
    </Link>
  );

  return (
    <>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Eventos</h1>
        <p className="text-sm text-muted">Degustações e jantares. Ao concluir um evento, os vinhos servidos saem do estoque sem contar como venda de prateleira.</p>
      </div>
      <Flash sp={await searchParams} />
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-8">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="card lift"><p className="text-sm text-muted">Próximos</p><p className="num mt-1 text-4xl">{upcoming.length}</p><p className="text-xs text-muted">{upcoming.reduce((t, e) => t + e.ticketsSold, 0)} ingressos vendidos</p></div>
            <div className="card lift"><p className="text-sm text-muted">Realizados</p><p className="num mt-1 text-4xl">{done.length}</p><p className="text-xs text-muted">{done.reduce((t, e) => t + e.ticketsSold, 0)} pessoas recebidas</p></div>
            <div className="card lift"><p className="text-sm text-muted">Lucro dos realizados</p><p className="num mt-1 text-4xl text-gold">{usd(done.reduce((t, e) => t + e.revenue - e.cost, 0))}</p><p className="text-xs text-muted">ingressos menos vinhos servidos</p></div>
          </div>
          <h2 className="pt-2 font-semibold tracking-tight">Próximos</h2>
          {upcoming.length === 0 ? <p className="card text-sm text-muted">Nenhum evento planejado. Crie o primeiro ao lado.</p> : (
            <div className="grid gap-4 sm:grid-cols-2">{upcoming.map((e) => <Card key={e.id} e={e} />)}</div>
          )}
          {past.length > 0 && (
            <>
              <h2 className="pt-2 font-semibold tracking-tight">Encerrados</h2>
              <div className="grid gap-4 sm:grid-cols-2">{past.map((e) => <Card key={e.id} e={e} />)}</div>
            </>
          )}
        </div>

        <form action={createEvent} className="card space-y-3 self-start xl:col-span-4">
          <h2 className="font-semibold tracking-tight">Novo evento</h2>
          <div><label className="label" htmlFor="name">Nome</label><input className="input" id="name" name="name" placeholder="Noite de Malbec" required /></div>
          <div className="flex gap-2">
            <div className="flex-1"><label className="label" htmlFor="day">Data</label><input className="input" id="day" name="day" type="date" defaultValue={today} required /></div>
            <div><label className="label" htmlFor="time">Hora</label><input className="input" id="time" name="time" type="time" /></div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1"><label className="label" htmlFor="capacity">Vagas</label><input className="input" id="capacity" name="capacity" type="number" min={0} /></div>
            <div className="flex-1"><label className="label" htmlFor="ticket">Ingresso (US$)</label><input className="input" id="ticket" name="ticket" inputMode="decimal" /></div>
          </div>
          <div><label className="label" htmlFor="notes">Observações</label><input className="input" id="notes" name="notes" /></div>
          <button className="btn w-full">Criar evento</button>
        </form>
      </div>
    </>
  );
}
