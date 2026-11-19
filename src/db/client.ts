import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema.ts";

export function createDb(url = process.env.DATABASE_URL ?? "file:./data/oasis.db") {
  return drizzle(createClient({ url }), { schema });
}

export type Db = ReturnType<typeof createDb>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
