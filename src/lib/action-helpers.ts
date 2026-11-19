import { redirect } from "next/navigation";
import { UserError } from "./stock";

export const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export function fail(path: string, msg: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}erro=${encodeURIComponent(msg)}`);
}

/** Roda fn; UserError vira mensagem na tela, o resto estoura. */
export async function attempt<T>(path: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof UserError) return fail(path, e.message);
    throw e;
  }
}
