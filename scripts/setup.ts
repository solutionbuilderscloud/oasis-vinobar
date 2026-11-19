// Cria/atualiza o banco e semeia dados iniciais. Pode rodar várias vezes.
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "../src/db/client.ts";
import { regions, settings, users } from "../src/db/schema.ts";
import { hashPassword } from "../src/lib/password.ts";

mkdirSync("data", { recursive: true });
const db = createDb();
await migrate(db, { migrationsFolder: "./drizzle" });

await db.insert(regions).values(
  ["Itália", "Espanha", "França", "Argentina", "Chile", "África do Sul", "Napa Valley", "Austrália"].map((name) => ({ name })),
).onConflictDoNothing();

// câmbio de exemplo; a gestão ajusta em Configurações
await db.insert(settings).values([
  { key: "pyg_per_usd", value: "7500" },
  { key: "brl_per_usd", value: "5.50" },
  // auto = cotação de mercado buscada todo dia; manual = os dois valores acima
  { key: "rate_mode", value: "auto" },
  // reposição: dias entre pedir e receber, e folga de segurança
  { key: "lead_days", value: "14" },
  { key: "safety_days", value: "7" },
  // IVA embutido no preço de prateleira; turista estrangeiro compra sem ele
  { key: "iva_percent", value: "10" },
]).onConflictDoNothing();

if ((await db.select({ id: users.id }).from(users).limit(1)).length === 0) {
  const password = randomBytes(9).toString("base64url");
  await db.insert(users).values({
    name: "Administrador", email: "admin@oasisvinobar.local", role: "admin", passwordHash: hashPassword(password),
  });
  console.log(`\nUsuário inicial criado. Anote, a senha não aparece de novo:\n  email: admin@oasisvinobar.local\n  senha: ${password}\n`);
}
console.log("Banco pronto.");
