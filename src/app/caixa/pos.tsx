"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { checkout } from "@/app/actions-venda";
import { type Currency, PAYMENT_METHODS, type PaymentMethod, REGISTERS, SALE_KINDS, type SaleKind } from "@/db/schema";
import { normalize } from "@/lib/csv";
import { parseMoney, type Rates } from "@/lib/money";
import { formatIn, inCurrency, saleTotals, toUsd } from "@/lib/sale-math";

type Wine = {
  id: number; itemNumber: number; barcode: string | null; name: string; producer: string; grape: string;
  vintage: number | null; type: string; priceCents: number; stock: number; region: string; photo: string | null;
};
type Done = { saleId: number; kind: SaleKind; paid: string; change: string | null; bottles: number };

const NAME = { USD: "Dólar", BRL: "Real", PYG: "Guarani" };
const ORDER: Currency[] = ["USD", "BRL", "PYG"];
const seg = (on: boolean) => `flex-1 rounded-full px-3 py-2 text-sm font-medium capitalize transition-colors ${on ? "bg-inverse text-inverse-fg" : "text-muted hover:text-fg"}`;

/** Tela do operador de caixa: lista do que o cliente está levando e o total nas três moedas, pelo câmbio do dia. */
export function Pos({ catalog, rates, ivaPercent, customers }: {
  catalog: Wine[]; rates: Rates; ivaPercent: number; customers: { id: number; name: string; country: string }[];
}) {
  const router = useRouter();
  const scan = useRef<HTMLInputElement>(null);
  const register = useRef<HTMLSelectElement>(null);
  const [query, setQuery] = useState("");
  // ordem de entrada no carrinho = ordem do cupom
  const [cart, setCart] = useState<{ id: number; qty: number }[]>([]);
  const [lastId, setLastId] = useState<number | null>(null);
  const [kind, setKind] = useState<SaleKind>("venda");
  const [tourist, setTourist] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [note, setNote] = useState("");
  const [password, setPassword] = useState("");
  const [currency, setCurrency] = useState<Currency>("USD");
  const [method, setMethod] = useState<PaymentMethod>("dinheiro");
  const [received, setReceived] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<Done | null>(null);
  const [pending, start] = useTransition();

  // cada monitor lembra qual caixa é
  useEffect(() => {
    try { const saved = localStorage.getItem("caixa"); if (saved && register.current) register.current.value = saved; } catch {}
  }, []);

  const byId = useMemo(() => new Map(catalog.map((w) => [w.id, w])), [catalog]);
  const q = normalize(query);
  const matches = useMemo(
    () => (q ? catalog.filter((w) => normalize(`${w.name} ${w.producer} ${w.grape} ${w.region} ${w.itemNumber} ${w.barcode ?? ""}`).includes(q)).slice(0, 8) : []),
    [q, catalog],
  );

  const lines = cart.flatMap((c) => { const w = byId.get(c.id); return w ? [{ ...w, qty: c.qty }] : []; });
  const last = lastId === null ? undefined : lines.find((l) => l.id === lastId);
  const bottles = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + l.qty * l.priceCents, 0);
  const free = kind !== "venda";
  const t = free ? { discount: 0, tax: 0, exempt: 0, total: 0 } : saleTotals(subtotal, discount, tourist, ivaPercent);
  const due = inCurrency(t.total, currency, rates);
  const receivedCents = parseMoney(received);
  const change = !free && method === "dinheiro" && receivedCents !== null ? receivedCents - due : null;
  const needsAuth = free || discount > 0;
  const three = (usdCents: number) => ORDER.map((c) => formatIn(inCurrency(usdCents, c, rates), c));
  // troco nas três moedas: exato na moeda paga, convertido nas outras
  const changeText = change !== null && change > 0
    ? ORDER.map((c) => formatIn(c === currency ? change : inCurrency(toUsd(change, currency, rates), c, rates), c)).join("  ·  ") : null;

  function setQty(w: Wine, qty: number) {
    setError(qty > w.stock ? `${w.name}: só há ${w.stock} em estoque` : "");
    const n = Math.min(qty, w.stock);
    setCart((c) => (n <= 0 ? c.filter((x) => x.id !== w.id) : c.some((x) => x.id === w.id) ? c.map((x) => (x.id === w.id ? { ...x, qty: n } : x)) : [...c, { id: w.id, qty: n }]));
  }
  function add(w: Wine) {
    setQty(w, (cart.find((c) => c.id === w.id)?.qty ?? 0) + 1);
    setLastId(w.id); setQuery(""); scan.current?.focus();
  }

  // leitor de código de barras digita o código e manda Enter
  function onScan(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || !query.trim()) return;
    e.preventDefault();
    const code = query.trim();
    const hit = catalog.find((w) => w.barcode === code || String(w.itemNumber) === code) ?? (matches.length === 1 ? matches[0] : null);
    if (hit) add(hit); else setError(matches.length ? "Mais de um vinho encontrado: toque no certo" : `Nada encontrado para "${code}"`);
  }

  function reset() {
    setCart([]); setLastId(null); setKind("venda"); setDiscount(0); setTourist(false); setReceived(""); setCustomerId(""); setNote(""); setPassword(""); setError("");
  }

  function finish() {
    setError("");
    const reg = Number(register.current?.value ?? 1);
    start(async () => {
      const r = await checkout({
        items: lines.map((l) => ({ wineId: l.id, qty: l.qty })), register: reg, tourist, discountPercent: free ? 0 : discount,
        currency, method, customerId: customerId ? Number(customerId) : null, kind, note,
      }, needsAuth ? password : "");
      setPassword("");
      if (!r.ok) { setError(r.error); return; }
      setDone({ saleId: r.saleId, kind, paid: formatIn(r.paidCents, currency), change: changeText, bottles });
      reset();
      router.refresh(); // estoque novo
    });
  }

  if (done) {
    return (
      <div className="card mx-auto mt-10 w-full max-w-xl text-center" role="status">
        <p className="mx-auto flex size-16 items-center justify-center rounded-full bg-gold text-3xl text-inverse-fg" aria-hidden="true">✓</p>
        <h1 className="mt-4 text-2xl font-semibold capitalize tracking-tight">{done.kind} nº {done.saleId} registrada</h1>
        <p className="text-sm text-muted">{done.bottles} {done.bottles === 1 ? "garrafa" : "garrafas"} · estoque já atualizado</p>
        <p className="num mt-6 text-5xl">{done.kind === "venda" ? done.paid : "Sem cobrança"}</p>
        {done.change !== null && (
          <div className="tile mt-4">
            <p className="text-sm text-muted">Troco, em qualquer uma das moedas</p>
            <p className="num mt-1 text-xl text-gold">{done.change}</p>
          </div>
        )}
        <button className="btn mt-6 w-full !py-4 text-base" autoFocus onClick={() => { setDone(null); setTimeout(() => scan.current?.focus()); }}>Próximo cliente</button>
      </div>
    );
  }

  return (
    <div className="grid flex-1 gap-4 xl:grid-cols-12">
      <section className="flex flex-col gap-4 xl:col-span-8">
        <div className="card flex flex-wrap items-end gap-3">
          <div className="relative min-w-56 flex-1">
            <label className="label" htmlFor="scan">Bipe o código de barras ou digite nome, nº do item, uva</label>
            <input ref={scan} className="input !py-3 text-lg" id="scan" autoFocus autoComplete="off" value={query}
              onChange={(e) => { setQuery(e.target.value); setError(""); }} onKeyDown={onScan} placeholder="Bipe ou digite e aperte Enter" />
            {matches.length > 0 && (
              <ul className="card absolute inset-x-0 top-full z-20 mt-2 max-h-80 overflow-y-auto !p-2">
                {matches.map((w) => (
                  <li key={w.id}>
                    <button type="button" disabled={w.stock <= 0} onClick={() => add(w)} className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left hover:bg-fg/[0.08] disabled:opacity-40">
                      <span className="min-w-0"><span className="block truncate font-medium">{w.name} {w.vintage ?? ""}</span><span className="block truncate text-xs text-muted">nº {w.itemNumber} · {w.producer} · {w.stock > 0 ? `${w.stock} em estoque` : "sem estoque"}</span></span>
                      <span className="num shrink-0">{formatIn(w.priceCents, "USD")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <label className="label" htmlFor="register">Caixa</label>
            <select ref={register} className="input" id="register" defaultValue="1" onChange={(e) => { try { localStorage.setItem("caixa", e.target.value); } catch {} }}>
              {REGISTERS.map((r) => <option key={r} value={r}>Caixa {r}</option>)}
            </select>
          </div>
        </div>

        <div className="card-wine card flex flex-wrap items-center justify-between gap-4" aria-live="polite">
          {last ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- arquivo servido pela nossa rota /fotos */}
              {last.photo && <img src={`/fotos/${last.photo}`} alt="" className="h-24 w-16 shrink-0 rounded-xl object-cover" />}
              <div className="mr-auto min-w-0">
                <p className="text-xs uppercase tracking-[0.2em] opacity-70">Último item · {last.region}</p>
                <p className="truncate text-3xl font-semibold tracking-tight">{last.name} {last.vintage ?? ""}</p>
                <p className="text-sm opacity-70">nº {last.itemNumber} · {last.producer} · {last.qty} no cupom</p>
              </div>
              <div className="text-right">
                <p className="num text-5xl">{formatIn(last.priceCents, "USD")}</p>
                <p className="num mt-1 text-lg opacity-80">{three(last.priceCents).slice(1).join("  ·  ")}</p>
              </div>
            </>
          ) : <p className="py-4 text-lg opacity-80">Caixa livre. Bipe a primeira garrafa.</p>}
        </div>

        <div className="card flex-1">
          <div className="mb-2 flex items-baseline justify-between">
            <h1 className="font-semibold tracking-tight">Cupom · {lines.length} {lines.length === 1 ? "item" : "itens"} · {bottles} {bottles === 1 ? "garrafa" : "garrafas"}</h1>
            {bottles > 0 && <button type="button" className="text-xs text-muted underline underline-offset-2 hover:text-fg" onClick={reset}>Cancelar cupom</button>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr><th className="th w-10">#</th><th className="th">Item</th><th className="th text-center">Qtd</th><th className="th text-right">Unitário</th><th className="th text-right">US$</th><th className="th text-right">R$</th><th className="th text-right">₲</th></tr></thead>
              <tbody>
                {lines.map((l, i) => {
                  const [u, b, p] = three(l.qty * l.priceCents);
                  return (
                    <tr key={l.id} className={l.id === lastId ? "bg-fg/[0.05]" : ""}>
                      <td className="td text-muted">{i + 1}</td>
                      <td className="td"><span className="font-medium">{l.name} {l.vintage ?? ""}</span><span className="block text-xs text-muted">nº {l.itemNumber} · {l.producer}</span></td>
                      <td className="td">
                        <span className="flex items-center justify-center gap-1">
                          <button type="button" className="btn-ghost size-8 !p-0" aria-label={`Tirar uma de ${l.name}`} onClick={() => setQty(l, l.qty - 1)}>−</button>
                          <span className="num w-7 text-center">{l.qty}</span>
                          <button type="button" className="btn-ghost size-8 !p-0" aria-label={`Mais uma de ${l.name}`} onClick={() => setQty(l, l.qty + 1)}>+</button>
                        </span>
                      </td>
                      <td className="td text-right tabular-nums text-muted">{formatIn(l.priceCents, "USD")}</td>
                      <td className="td num text-right">{u}</td>
                      <td className="td text-right tabular-nums">{b}</td>
                      <td className="td text-right tabular-nums">{p}</td>
                    </tr>
                  );
                })}
                {lines.length === 0 && <tr><td className="td py-10 text-center text-muted" colSpan={7}>Nenhum item no cupom.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="card flex flex-col gap-4 self-start xl:sticky xl:top-4 xl:col-span-4">
        <div>
          <p className="label">{free ? `${kind}: sem cobrança. Valor de prateleira:` : "Total a pagar · toque na moeda em que o cliente vai pagar"}</p>
          <div className="space-y-2" role="group" aria-label="Total nas três moedas">
            {ORDER.map((c) => {
              const on = !free && currency === c;
              return (
                <button key={c} type="button" disabled={free} aria-pressed={on} onClick={() => { setCurrency(c); setReceived(""); }}
                  className={`tile flex w-full items-baseline justify-between gap-3 text-left transition-shadow ${on ? "ring-2 ring-gold" : ""}`}>
                  <span className="text-sm text-muted">{NAME[c]}</span>
                  <span className={`num ${on ? "text-5xl text-gold" : "text-3xl"}`}>{formatIn(inCurrency(free ? subtotal : t.total, c, rates), c)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <dl className="space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{formatIn(subtotal, "USD")}</dd></div>
          {t.discount > 0 && <div className="flex justify-between text-gold"><dt>Desconto {discount}%</dt><dd className="tabular-nums">− {formatIn(t.discount, "USD")}</dd></div>}
          {!free && (tourist
            ? <div className="flex justify-between text-gold"><dt>IVA isento (turista)</dt><dd className="tabular-nums">− {formatIn(t.exempt, "USD")}</dd></div>
            : <div className="flex justify-between"><dt className="text-muted">IVA incluso</dt><dd className="tabular-nums text-muted">{formatIn(t.tax, "USD")}</dd></div>)}
        </dl>

        {!free && (
          <>
            <label className={`tile flex cursor-pointer items-center gap-3 !p-3 text-sm ${tourist ? "ring-2 ring-gold" : ""}`}>
              <input type="checkbox" className="size-5 accent-[var(--gold)]" checked={tourist} onChange={(e) => setTourist(e.target.checked)} />
              <span>Turista estrangeiro<span className="block text-xs text-muted">venda sem IVA de {ivaPercent}%</span></span>
            </label>
            <div className="flex rounded-full border border-line p-1" role="group" aria-label="Forma de pagamento">
              {PAYMENT_METHODS.map((m) => <button key={m} type="button" aria-pressed={method === m} className={seg(method === m)} onClick={() => setMethod(m)}>{m}</button>)}
            </div>
            {method === "dinheiro" && (
              <div>
                <label className="label" htmlFor="received">Recebido em {NAME[currency].toLowerCase()}</label>
                <input className="input !py-3 text-lg" id="received" inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value)} />
                {change !== null && (
                  <p className="tile mt-2 !p-3 text-sm" aria-live="polite">
                    {change < 0 ? <>Faltam <b className="num text-lg">{formatIn(-change, currency)}</b></> : <>Troco <b className="num block text-lg text-gold">{changeText ?? formatIn(0, currency)}</b></>}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        <div>
          <label className="label" htmlFor="customer">Cliente {kind === "permuta" ? "(obrigatório na permuta)" : "(opcional)"}</label>
          <select className="input" id="customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Sem cadastro</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.country && ` · ${c.country}`}</option>)}
          </select>
        </div>

        <details className="tile !p-0" open={needsAuth}>
          <summary className="cursor-pointer p-3 text-sm font-medium">Desconto, bonificação ou permuta <span className="font-normal text-muted">· pede senha</span></summary>
          <div className="space-y-3 border-t border-line p-3">
            <div className="flex rounded-full border border-line p-1" role="group" aria-label="Tipo de saída">
              {SALE_KINDS.map((k) => <button key={k} type="button" aria-pressed={kind === k} className={seg(kind === k)} onClick={() => setKind(k)}>{k}</button>)}
            </div>
            {free ? (
              <div>
                <label className="label" htmlFor="note">{kind === "permuta" ? "Trocado por quê?" : "Motivo da bonificação"}</label>
                <input className="input" id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === "permuta" ? "Fotos do evento, manutenção do ar…" : "Cortesia, cliente antigo, garrafa de degustação…"} />
              </div>
            ) : (
              <div>
                <label className="label" htmlFor="discount">Desconto %</label>
                <input className="input" id="discount" type="number" min={0} max={100} value={discount || ""} placeholder="0" onChange={(e) => setDiscount(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} />
              </div>
            )}
            {needsAuth && (
              <div>
                <label className="label" htmlFor="password">Senha de um gerente ou da gestão</label>
                <input className="input" id="password" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            )}
          </div>
        </details>

        {error && <p role="alert" className="rounded-2xl bg-wine px-4 py-3 text-sm text-white">{error}</p>}
        <button type="button" className="btn w-full !py-4 text-base disabled:opacity-40" onClick={finish}
          disabled={pending || lines.length === 0 || (change !== null && change < 0) || (needsAuth && !password)}>
          {pending ? "Registrando…" : free ? `Registrar ${kind} · ${bottles} ${bottles === 1 ? "garrafa" : "garrafas"}` : `Finalizar venda · ${formatIn(due, currency)}`}
        </button>
      </section>
    </div>
  );
}
