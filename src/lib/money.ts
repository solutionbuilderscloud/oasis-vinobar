/** "12,50" | "12.50" | "1.234,56" | "US$ 12" -> centavos. null se inválido. */
export function parseMoney(input: string): number | null {
  let s = input.replace(/[^\d.,]/g, "");
  if (!s) return null;
  const lastSep = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  // o último separador só é decimal se sobrarem 1 ou 2 dígitos depois dele
  if (lastSep !== -1 && s.length - lastSep - 1 <= 2) {
    s = s.slice(0, lastSep).replace(/[.,]/g, "") + "." + s.slice(lastSep + 1);
  } else {
    s = s.replace(/[.,]/g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export type Rates = { pyg: number; brl: number };

export const usd = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "USD" });

export const brl = (cents: number, rates: Rates) =>
  ((cents / 100) * rates.brl).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const pyg = (cents: number, rates: Rates) =>
  "₲ " + Math.round((cents / 100) * rates.pyg).toLocaleString("pt-BR");
