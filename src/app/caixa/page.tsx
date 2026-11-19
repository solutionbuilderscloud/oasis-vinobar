import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/ui";
import { db } from "@/db";
import { customers, regions, wines } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getIvaPercent, getRateInfo } from "@/lib/data";
import { formatDay } from "@/lib/dates";
import { Pos } from "./pos";

export const metadata: Metadata = { title: "Oasis Vinobar — caixa" };
// depende da sessão, do estoque e do câmbio do momento
export const instant = false;

async function Register() {
  const user = await requireUser();
  await connection();
  const [catalog, rate, ivaPercent, people] = await Promise.all([
    // só o que o caixa precisa: custo não vai para a tela
    db.select({
      id: wines.id, itemNumber: wines.itemNumber, barcode: wines.barcode, name: wines.name, producer: wines.producer, grape: wines.grape,
      vintage: wines.vintage, type: wines.type, priceCents: wines.priceCents, stock: wines.stock, region: regions.name, photo: wines.photo,
    }).from(wines).innerJoin(regions, eq(regions.id, wines.regionId)).where(eq(wines.active, true)).orderBy(wines.name),
    getRateInfo(), getIvaPercent(),
    db.select({ id: customers.id, name: customers.name, country: customers.country }).from(customers).orderBy(customers.name),
  ]);
  return (
    <div className="mx-auto flex min-h-screen max-w-[1800px] flex-col gap-4 p-4">
      <header className="card flex flex-wrap items-center gap-x-6 gap-y-2 !py-3">
        <Logo />
        <p className="text-sm"><span className="text-muted">Operador</span> <b>{user.name}</b></p>
        <p className="mr-auto text-sm first-letter:uppercase"><span className="text-muted">{formatDay(rate.day, { weekday: "long", day: "numeric", month: "long" })} · câmbio do dia</span>{" "}
          <b className="tabular-nums">US$ 1 = R$ {rate.brl.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} = ₲ {rate.pyg.toLocaleString("pt-BR")}</b> <span className="text-xs text-muted">({rate.source})</span>
        </p>
        <ThemeToggle />
        <Link className="btn-ghost" href="/">Sair do caixa</Link>
      </header>
      <Pos catalog={catalog} rates={{ pyg: rate.pyg, brl: rate.brl }} ivaPercent={ivaPercent} customers={people} />
    </div>
  );
}

export default function Caixa() {
  return <Suspense fallback={<p className="p-8 text-center text-sm text-muted">Abrindo o caixa…</p>}><Register /></Suspense>;
}
