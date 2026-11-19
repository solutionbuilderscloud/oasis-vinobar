// Gráficos em SVG/CSS puro, renderizados no servidor.
import Link from "next/link";

const pct = (part: number, total: number) => (total ? (part / total) * 100 : 0);

/** Linha com área: tendência de um valor ao longo dos dias. */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1 || 1)) * 100, 36 - ((v - min) / span) * 30] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-14 w-full" role="img" aria-label={label}>
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--gold)" stopOpacity="0.45" />
          <stop offset="1" stopColor="var(--gold)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line}L100 40L0 40Z`} fill="url(#spark-fill)" />
      <path d={line} fill="none" stroke="var(--gold)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Pirulitos: um valor por dia, o último (hoje) em dourado. */
export function Lollipops({ values, labels, label }: { values: number[]; labels: string[]; label: string }) {
  const peak = Math.max(1, ...values);
  return (
    <div className="flex h-14 items-end gap-2" role="img" aria-label={label}>
      {values.map((v, i) => {
        const today = i === values.length - 1;
        return (
          <div key={i} className="relative flex h-full flex-1 justify-center" title={`${labels[i]}: ${v}`}>
            <div className="absolute bottom-0 w-px bg-fg/25" style={{ height: `${Math.max(6, pct(v, peak))}%` }}>
              <i className={`absolute -top-1 left-1/2 size-2 -translate-x-1/2 rounded-full ${today ? "bg-gold ring-4 ring-gold/20" : "bg-fg"}`} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Meia-lua com percentual. */
export function Gauge({ value, caption }: { value: number; caption: string }) {
  return (
    <div className="relative mx-auto w-full max-w-40">
      <svg viewBox="0 0 72 42" className="w-full" role="img" aria-label={`${value.toFixed(0)}% ${caption}`}>
        <path d="M6 38A30 30 0 0 1 66 38" fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-fg/10" />
        <path d="M6 38A30 30 0 0 1 66 38" fill="none" strokeWidth="5" strokeLinecap="round" stroke="var(--gold)" pathLength={100} strokeDasharray={`${Math.max(0, Math.min(100, value))} 100`} />
      </svg>
      <p className="absolute inset-x-0 bottom-0 text-center leading-none">
        <span className="num text-2xl">{value.toFixed(0)}%</span>
        <span className="block pt-1 text-[10px] uppercase tracking-widest text-muted">{caption}</span>
      </p>
    </div>
  );
}

/** Arco de 270° dividido em fatias. */
export function DonutArc({ segments, center, caption }: { segments: { name: string; value: number; color: string }[]; center: string; caption: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const ARC = 75; // 270° de um círculo de perímetro 100
  const lens = segments.map((s) => (s.value / total) * ARC);
  const starts = lens.map((_, i) => lens.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <div className="relative size-36 shrink-0">
      <svg viewBox="0 0 36 36" className="size-full rotate-[135deg]" role="img" aria-label={`${caption}: ${segments.map((s) => `${s.name} ${pct(s.value, total).toFixed(0)}%`).join(", ")}`}>
        <circle cx="18" cy="18" r="15.9155" fill="none" strokeWidth="3.2" strokeLinecap="round" className="stroke-fg/10" strokeDasharray={`${ARC} 100`} />
        {segments.map((s, i) => (
          <circle key={s.name} cx="18" cy="18" r="15.9155" fill="none" strokeWidth="3.2" stroke={s.color}
            strokeDasharray={`${Math.max(0, lens[i] - 0.8)} 100`} strokeDashoffset={-starts[i]} />
        ))}
      </svg>
      <p className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="num text-3xl">{center}</span>
        <span className="pt-1 text-[10px] uppercase tracking-widest text-muted">{caption}</span>
      </p>
    </div>
  );
}

/** Uma barra por dia; cada barra é um link para aquele dia. */
export function DayBars({ days, label }: { days: { key: string; label: string; value: number; title: string; href?: string; selected: boolean }[]; label: string }) {
  const peak = Math.max(1, ...days.map((d) => d.value));
  return (
    <nav className="flex h-40 items-end gap-1" aria-label={label}>
      {days.map((d) => {
        const body = (
          <>
            <span className={`grow-y w-full max-w-4 rounded-full bg-gradient-to-t transition-[filter] group-hover:brightness-125 ${d.selected ? "from-gold/40 to-gold" : "from-wine/30 to-wine"}`}
              style={{ height: `${Math.max(3, pct(d.value, peak))}%` }} />
            {d.label && <span className={`text-[10px] tabular-nums ${d.selected ? "font-semibold text-gold" : "text-muted"}`}>{d.label}</span>}
          </>
        );
        const cls = "group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2 rounded-xl px-0.5 pt-2 hover:bg-fg/[0.06]";
        return d.href
          ? <Link key={d.key} href={d.href} scroll={false} title={d.title} aria-label={d.title} aria-current={d.selected ? "date" : undefined} className={cls}>{body}</Link>
          : <div key={d.key} title={d.title} className={cls}>{body}</div>;
      })}
    </nav>
  );
}

/** Um ponto por rótulo; os marcados ficam dourados. */
export function DotGrid({ total, marked, label }: { total: number; marked: number; label: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="img" aria-label={label}>
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className={`size-1.5 rounded-full ${i < marked ? "bg-gold" : "bg-fg/20"}`} />
      ))}
    </div>
  );
}

/** Lista de barras horizontais. */
export function HBars({ rows, tone = "fg" }: { rows: { name: string; value: number; text: string; href?: string }[]; tone?: "fg" | "gold" | "wine" }) {
  const peak = Math.max(1, ...rows.map((r) => r.value));
  const fill = { fg: "from-fg/30 to-fg", gold: "from-gold/30 to-gold", wine: "from-wine/40 to-wine" }[tone];
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const body = (
          <>
            <div className="flex justify-between gap-3 text-sm"><span className="truncate group-hover:underline">{r.name}</span><span className="shrink-0 tabular-nums text-muted">{r.text}</span></div>
            <div className="mt-1.5 h-1.5 rounded-full bg-fg/10"><div className={`grow-x h-full rounded-full bg-gradient-to-r transition-[filter] group-hover:brightness-125 ${fill}`} style={{ width: `${pct(r.value, peak)}%` }} /></div>
          </>
        );
        return <li key={r.name}>{r.href ? <Link href={r.href} className="group block">{body}</Link> : body}</li>;
      })}
    </ul>
  );
}

/** Colunas com rótulo embaixo e valor em cima (histograma). */
export function Columns({ rows, label }: { rows: { name: string; value: number }[]; label: string }) {
  const peak = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="flex h-64 items-end gap-3" role="img" aria-label={label}>
      {rows.map((r) => (
        <div key={r.name} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
          <span className="num text-sm">{r.value}</span>
          <div className="grow-y w-full rounded-xl bg-gradient-to-t from-wine/30 to-wine" style={{ height: `${Math.max(3, pct(r.value, peak) * 0.75)}%` }} />
          <span className="text-center text-[10px] leading-tight text-muted">{r.name}</span>
        </div>
      ))}
    </div>
  );
}

/** Dispersão: cada ponto é um link. Linhas tracejadas marcam as medianas e formam quatro quadrantes. */
export function Scatter({ points, xLabel, yLabel, label }: {
  points: { key: number | string; x: number; y: number; size: number; title: string; href: string; gold: boolean }[];
  xLabel: string; yLabel: string; label: string;
}) {
  const W = 100, H = 56;
  const maxX = Math.max(1, ...points.map((p) => p.x)), maxY = Math.max(1, ...points.map((p) => p.y)), maxS = Math.max(1, ...points.map((p) => p.size));
  const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] ?? 0;
  const minY = Math.min(maxY, ...points.map((p) => p.y));
  const px = (x: number) => 5 + (x / maxX) * (W - 10), py = (y: number) => H - 5 - ((y - minY) / (maxY - minY || 1)) * (H - 10);
  const mx = px(median(points.map((p) => p.x))), my = py(median(points.map((p) => p.y)));
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="group" aria-label={label}>
        <line x1={mx} x2={mx} y1="2" y2={H - 2} className="stroke-fg/20" strokeWidth="0.2" strokeDasharray="1 1" />
        <line x1="2" x2={W - 2} y1={my} y2={my} className="stroke-fg/20" strokeWidth="0.2" strokeDasharray="1 1" />
        {points.map((p) => (
          <Link key={p.key} href={p.href} aria-label={p.title}>
            <title>{p.title}</title>
            <circle cx={px(p.x)} cy={py(p.y)} r={0.9 + Math.sqrt(p.size / maxS) * 2.6}
              className={`transition-opacity hover:opacity-100 ${p.gold ? "fill-gold" : "fill-wine"} opacity-70`} />
          </Link>
        ))}
      </svg>
      <p className="flex justify-between text-[10px] text-muted"><span>↑ {yLabel}</span><span>{xLabel} →</span></p>
    </div>
  );
}
