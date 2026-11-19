"use server";

import { and, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { customers, suppliers, users } from "@/db/schema";
import { attempt, fail, str } from "@/lib/action-helpers";
import { requireUser } from "@/lib/auth";
import { cancelSale as cancel, createSale, type SaleInput } from "@/lib/checkout";
import { getIvaPercent, getRates } from "@/lib/data";
import { parseMoney } from "@/lib/money";
import { verifyPassword } from "@/lib/password";
import { UserError } from "@/lib/stock";

// shortcut: limite de tentativas em memória, por operador; zera ao reiniciar. Trocar por tabela se escalar.
const tries = new Map<number, { n: number; until: number }>();

/** Confere a senha contra gerentes e gestão ativos. Devolve quem autorizou, ou null. */
async function authorize(operatorId: number, password: string) {
  const t = tries.get(operatorId);
  if (t && t.n >= 5 && t.until > Date.now()) return null;
  const bosses = await db.select().from(users).where(and(eq(users.active, true), inArray(users.role, ["admin", "gerente"])));
  const boss = password ? bosses.find((u) => verifyPassword(password, u.passwordHash)) : undefined;
  if (boss) tries.delete(operatorId);
  else tries.set(operatorId, { n: t && t.until > Date.now() ? t.n + 1 : 1, until: Date.now() + 15 * 60_000 });
  return boss?.id ?? null;
}

export type CheckoutResult = { ok: true; saleId: number; totalCents: number; paidCents: number } | { ok: false; error: string };

/** Chamada direto pela tela do caixa; devolve o resultado em vez de redirecionar, para o caixa não perder o cupom. */
export async function checkout(input: SaleInput, password = ""): Promise<CheckoutResult> {
  const user = await requireUser();
  let authorizedBy: number | null = null;
  if ((input.kind ?? "venda") !== "venda" || input.discountPercent > 0) {
    authorizedBy = await authorize(user.id, password);
    if (authorizedBy === null) return { ok: false, error: "Senha de responsável incorreta. Desconto, bonificação e permuta pedem a senha de um gerente ou da gestão." };
  }
  try {
    const sale = await createSale(db, input, { ivaPercent: await getIvaPercent(), rates: await getRates() }, user.id, authorizedBy);
    return { ok: true, saleId: sale.id, totalCents: sale.totalCents, paidCents: sale.paidCents };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function cancelSale(f: FormData) {
  const user = await requireUser("admin", "gerente");
  const back = `/vendas?dia=${str(f, "dia")}`;
  await attempt(back, () => cancel(db, Number(str(f, "id")), user.id));
  redirect(`${back}&ok=${encodeURIComponent(`Venda nº ${str(f, "id")} estornada e estoque devolvido`)}`);
}

const id = (f: FormData) => (/^\d+$/.test(str(f, "id")) ? Number(str(f, "id")) : null);

export async function saveCustomer(f: FormData) {
  const user = await requireUser();
  const name = str(f, "name");
  if (!name) fail("/clientes", "Nome é obrigatório");
  const barterLimitCents = str(f, "barterLimit") ? parseMoney(str(f, "barterLimit")) : 0;
  if (barterLimitCents === null || barterLimitCents < 0) fail("/clientes", "Crédito de permuta inválido");
  const base = { name, document: str(f, "document"), country: str(f, "country"), phone: str(f, "phone"), email: str(f, "email"), notes: str(f, "notes") };
  // crédito de permuta é dinheiro: só gerente e gestão mexem
  const values = user.role === "caixa" ? base : { ...base, barterLimitCents };
  const editing = id(f);
  if (editing) await db.update(customers).set(values).where(eq(customers.id, editing));
  else await db.insert(customers).values(values);
  redirect(`/clientes?ok=${encodeURIComponent(editing ? "Cliente atualizado" : "Cliente cadastrado")}`);
}

export async function saveSupplier(f: FormData) {
  await requireUser("admin", "gerente");
  const name = str(f, "name");
  const leadDays = Number(str(f, "leadDays") || "0");
  if (!name) fail("/fornecedores", "Nome é obrigatório");
  if (!Number.isInteger(leadDays) || leadDays < 0 || leadDays > 365) fail("/fornecedores", "Prazo de entrega inválido");
  const values = { name, leadDays, country: str(f, "country"), contact: str(f, "contact"), phone: str(f, "phone"), email: str(f, "email"), notes: str(f, "notes") };
  const editing = id(f);
  if (editing) await db.update(suppliers).set(values).where(eq(suppliers.id, editing));
  else await db.insert(suppliers).values(values);
  redirect(`/fornecedores?ok=${encodeURIComponent(editing ? "Fornecedor atualizado" : "Fornecedor cadastrado")}`);
}

export async function deleteSupplier(f: FormData) {
  await requireUser("admin", "gerente");
  await db.delete(suppliers).where(eq(suppliers.id, Number(str(f, "id"))));
  redirect("/fornecedores?ok=Fornecedor+removido");
}
