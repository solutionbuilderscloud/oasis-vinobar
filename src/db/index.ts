import "server-only";
import { createDb, type Db } from "./client";

const g = globalThis as { __oasisDb?: Db };
export const db = (g.__oasisDb ??= createDb());
