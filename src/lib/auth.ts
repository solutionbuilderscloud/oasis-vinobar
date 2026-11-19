import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { type Role, sessions, users } from "@/db/schema";

const COOKIE = "oasis_session";
const DAYS_30 = 30 * 24 * 60 * 60;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export type CurrentUser = { id: number; name: string; role: Role };

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  await db.insert(sessions).values({ id: sha(token), userId, expiresAt: new Date(Date.now() + DAYS_30 * 1000) });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: DAYS_30,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, sha(token)));
  jar.delete(COOKIE);
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  const cols = { id: users.id, name: users.name, role: users.role };
  if (token) {
    const [user] = await db
      .select(cols)
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.id, sha(token)), sql`${sessions.expiresAt} > unixepoch()`, eq(users.active, true)));
    if (user) return user;
  }
  // só em `pnpm dev`: entra sem senha como o primeiro admin. Em produção o login continua obrigatório.
  if (process.env.NODE_ENV === "development") {
    const [admin] = await db.select(cols).from(users).where(and(eq(users.role, "admin"), eq(users.active, true))).limit(1);
    return admin ?? null;
  }
  return null;
});

/** Sem sessão vai para o login; cargo errado volta ao painel. Chamar em toda página e toda action. */
export async function requireUser(...roles: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roles.length && !roles.includes(user.role)) redirect("/");
  return user;
}

export const canSeeCosts = (u: CurrentUser) => u.role !== "caixa";
