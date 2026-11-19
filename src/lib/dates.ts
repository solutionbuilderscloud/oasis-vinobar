// Dias são chaves "AAAA-MM-DD" no fuso da loja.
const TZ = "America/Asuncion";
const DAY = 86400_000;

export const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
export const todayKey = () => dayKey(new Date());
export const isDayKey = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
export const addDays = (key: string, n: number) => new Date(Date.parse(key) + n * DAY).toISOString().slice(0, 10);
export const diffDays = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);
export const keysBetween = (from: string, to: string) => Array.from({ length: diffDays(from, to) + 1 }, (_, i) => addDays(from, i));
export const formatDay = (key: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(Date.parse(key) + DAY / 2).toLocaleDateString("pt-BR", { timeZone: "UTC", ...opts });

/** Janela em UTC que com folga cobre os dias [from, to] no fuso da loja; filtrar depois por dayKey. */
export const utcBounds = (from: string, to: string) => [new Date(Date.parse(from) - DAY), new Date(Date.parse(to) + 2 * DAY)] as const;

/** Os últimos n dias, do mais antigo para hoje. */
export function lastDays(n: number) {
  const today = todayKey();
  return {
    since: new Date(Date.now() - (n + 1) * DAY),
    days: keysBetween(addDays(today, -(n - 1)), today).map((key) => ({ key, label: key.slice(8), out: 0, in: 0 })),
  };
}

// Meses são chaves "AAAA-MM".
export const isMonthKey = (s: unknown): s is string => typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
export function addMonths(key: string, n: number) {
  const total = Number(key.slice(0, 4)) * 12 + Number(key.slice(5)) - 1 + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}
export const monthDays = (key: string) => keysBetween(`${key}-01`, addDays(`${addMonths(key, 1)}-01`, -1));
export const formatMonth = (key: string) => formatDay(`${key}-01`, { month: "long", year: "numeric" });
