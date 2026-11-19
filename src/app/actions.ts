"use server";

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { dailyRates, MOVEMENT_TYPES, type MovementType, ROLES, type Role, regions, settings, users, wines } from "@/db/schema";
import { attempt, fail, str } from "@/lib/action-helpers";
import { createSession, destroySession, requireUser } from "@/lib/auth";
import { normalize, parseCsv } from "@/lib/csv";
import { getRates } from "@/lib/data";
import { todayKey } from "@/lib/dates";
import { hashPassword, verifyPassword } from "@/lib/password";
import { applyMovement, createWine, createWines, parseWineInput, updateWine, UserError } from "@/lib/stock";

const PHOTO_DIR = join(process.cwd(), "data", "fotos");
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// shortcut: limite de tentativas em memória, zera ao reiniciar e não vale entre várias instâncias; trocar por tabela se escalar
const attempts = new Map<string, { n: number; until: number }>();

export async function login(f: FormData) {
  const email = str(f, "email").toLowerCase();
  const a = attempts.get(email);
  if (a && a.n >= 5 && a.until > Date.now()) fail("/login", "Muitas tentativas. Aguarde 15 minutos.");
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user || !user.active || !verifyPassword(String(f.get("password") ?? ""), user.passwordHash)) {
    const n = a && a.until > Date.now() ? a.n + 1 : 1;
    attempts.set(email, { n, until: Date.now() + 15 * 60_000 });
    return fail("/login", "Email ou senha incorretos");
  }
  attempts.delete(email);
  await createSession(user.id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

const wineFields = (f: FormData) =>
  Object.fromEntries(
    ["name", "producer", "subregion", "grape", "vintage", "type", "price", "cost", "minStock", "barcode"].map((k) => [k, str(f, k)]),
  );

export async function saveWine(f: FormData) {
  const user = await requireUser("admin", "gerente");
  const id = Number(str(f, "id")) || null;
  const back = id ? `/estoque/${id}` : "/estoque/novo";
  const newId = await attempt(back, async () => {
    const input = parseWineInput(wineFields(f), Number(str(f, "regionId")) || undefined);
    const photo = f.get("photo");
    const ext = photo instanceof File && photo.size > 0 ? PHOTO_TYPES[photo.type] : undefined;
    if (photo instanceof File && photo.size > 0 && (!ext || photo.size > 5_000_000)) throw new UserError("Foto inválida: use JPG, PNG ou WebP de até 5 MB");
    const wineId = id ? await updateWine(db, id, input).then(() => id) : await createWine(db, input, Number(str(f, "stock") || 0), user.id);
    if (ext && photo instanceof File) {
      // nome do arquivo é gerado aqui, nunca vem do usuário
      await mkdir(PHOTO_DIR, { recursive: true });
      await writeFile(join(PHOTO_DIR, `${wineId}.${ext}`), Buffer.from(await photo.arrayBuffer()));
      await db.update(wines).set({ photo: `${wineId}.${ext}`, photoCredit: str(f, "photoCredit") }).where(eq(wines.id, wineId));
    } else if (id) await db.update(wines).set({ photoCredit: str(f, "photoCredit") }).where(eq(wines.id, wineId));
    return wineId;
  });
  redirect(`/estoque/${newId}`);
}

export async function moveStock(f: FormData) {
  const user = await requireUser("admin", "gerente");
  const wineId = Number(str(f, "wineId"));
  const back = `/estoque/${wineId}`;
  const type = str(f, "type") as MovementType;
  // evento, bonificação e permuta nascem nos seus próprios fluxos, com os controles deles
  if (!MOVEMENT_TYPES.includes(type) || ["evento", "bonificação", "permuta"].includes(type)) fail(back, "Tipo de movimento inválido");
  const qtyRaw = str(f, "qty");
  await attempt(back, () =>
    applyMovement(db, { wineId, type, qty: qtyRaw === "" ? NaN : Number(qtyRaw), note: str(f, "note"), userId: user.id }),
  );
  redirect(back);
}

// cabeçalhos aceitos na planilha (já normalizados) -> campo
const CSV_COLUMNS: Record<string, string> = {
  nome: "name", vinho: "name", produtor: "producer", vinicola: "producer", bodega: "producer",
  regiao: "region", pais: "region", subregiao: "subregion", uva: "grape", uvas: "grape", safra: "vintage",
  tipo: "type", preco: "price", precousd: "price", custo: "cost", custousd: "cost",
  estoque: "stock", quantidade: "stock", estoqueminimo: "minStock", codigodebarras: "barcode", ean: "barcode",
};

export async function importCsv(f: FormData) {
  const user = await requireUser("admin", "gerente");
  const back = "/estoque/importar";
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) return fail(back, "Selecione um arquivo CSV");
  const [header, ...lines] = parseCsv(await file.text());
  if (!header || lines.length === 0) return fail(back, "Arquivo vazio");
  const cols = header.map((h) => CSV_COLUMNS[normalize(h)]);
  if (!cols.includes("name") || !cols.includes("price") || !cols.includes("region"))
    return fail(back, "A planilha precisa das colunas: nome, regiao, preco");
  const regionByName = new Map((await db.select().from(regions)).map((r) => [normalize(r.name), r.id]));

  const count = await attempt(back, async () => {
    const rows = lines.map((line, i) => {
      const rec: Record<string, string> = {};
      cols.forEach((c, j) => c && (rec[c] = line[j] ?? ""));
      try {
        const stock = rec.stock ? Number(rec.stock) : 0;
        if (!Number.isInteger(stock) || stock < 0) throw new UserError("Estoque inválido");
        return { input: parseWineInput(rec, regionByName.get(normalize(rec.region ?? ""))), stock };
      } catch (e) {
        if (e instanceof UserError) throw new UserError(`Linha ${i + 2}: ${e.message}. Nada foi importado.`);
        throw e;
      }
    });
    return createWines(db, rows, user.id);
  });
  redirect(`/estoque?ok=${encodeURIComponent(`${count} vinhos importados`)}`);
}

export async function createUser(f: FormData) {
  await requireUser("admin");
  const name = str(f, "name");
  const email = str(f, "email").toLowerCase();
  const password = String(f.get("password") ?? "");
  const role = str(f, "role") as Role;
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) fail("/equipe", "Nome e email válidos são obrigatórios");
  if (password.length < 8) fail("/equipe", "Senha precisa de pelo menos 8 caracteres");
  if (!ROLES.includes(role)) fail("/equipe", "Cargo inválido");
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (taken) fail("/equipe", "Já existe um usuário com esse email");
  await db.insert(users).values({ name, email, role, passwordHash: hashPassword(password) });
  redirect("/equipe");
}

export async function setUserActive(f: FormData) {
  const me = await requireUser("admin");
  const id = Number(str(f, "id"));
  if (id === me.id) fail("/equipe", "Você não pode desativar a si mesmo");
  await db.update(users).set({ active: str(f, "active") === "1" }).where(eq(users.id, id));
  redirect("/equipe");
}

export async function saveRates(f: FormData) {
  await requireUser("admin");
  const mode = str(f, "rate_mode") === "auto" ? "auto" : "manual";
  const typed = { pyg: Number(str(f, "pyg_per_usd").replace(",", ".")), brl: Number(str(f, "brl_per_usd").replace(",", ".")) };
  if (mode === "manual" && !(typed.pyg > 0 && typed.brl > 0)) fail("/config", "Câmbio inválido");
  const put = (key: string, value: string) => db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
  await put("rate_mode", mode);
  if (mode === "manual") { await put("pyg_per_usd", String(typed.pyg)); await put("brl_per_usd", String(typed.brl)); }
  // recrava o câmbio de hoje com a nova regra; vendas já feitas guardam o valor que foi pago
  await db.delete(dailyRates).where(eq(dailyRates.day, todayKey()));
  await getRates();
  for (const key of ["lead_days", "safety_days"]) {
    const value = Number(str(f, key));
    if (!Number.isInteger(value) || value < 0 || value > 365) fail("/config", "Dias de reposição inválidos");
    await db.insert(settings).values({ key, value: String(value) }).onConflictDoUpdate({ target: settings.key, set: { value: String(value) } });
  }
  const iva = Number(str(f, "iva_percent").replace(",", "."));
  if (!(iva >= 0 && iva <= 50)) fail("/config", "IVA inválido");
  await db.insert(settings).values({ key: "iva_percent", value: String(iva) }).onConflictDoUpdate({ target: settings.key, set: { value: String(iva) } });
  redirect("/config?ok=Configura%C3%A7%C3%B5es+salvas");
}
