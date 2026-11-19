import { eq } from "drizzle-orm";
import { db } from "@/db";
import { regions, wines } from "@/db/schema";
import { canSeeCosts, requireUser } from "@/lib/auth";
import { todayKey } from "@/lib/dates";

// evita que o Excel execute fórmulas vindas de texto digitado no cadastro
const cell = (v: string | number | null) => {
  const s = String(v ?? "");
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};
const money = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

export async function GET() {
  const user = await requireUser();
  const costs = canSeeCosts(user);
  const rows = await db.select({ w: wines, region: regions.name }).from(wines).innerJoin(regions, eq(regions.id, wines.regionId)).orderBy(wines.name);
  const header = ["numero", "nome", "produtor", "regiao", "subregiao", "uva", "safra", "tipo", "preco", ...(costs ? ["custo"] : []), "estoque", "estoque minimo", "codigo de barras", "ativo"];
  const lines = rows.map(({ w, region }) =>
    [w.itemNumber, w.name, w.producer, region, w.subregion, w.grape, w.vintage, w.type, money(w.priceCents), ...(costs ? [money(w.costCents)] : []), w.stock, w.minStock, w.barcode, w.active ? "sim" : "nao"].map(cell).join(";"),
  );
  // BOM + ";" para abrir direto no Excel em português
  return new Response(`﻿${[header.map(cell).join(";"), ...lines].join("\r\n")}`, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="estoque-oasis-${todayKey()}.csv"` },
  });
}
