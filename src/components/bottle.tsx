import { TYPE_COLOR } from "@/lib/wine-meta";

/** Silhueta de garrafa; a cor do vidro indica o tipo e o rótulo mostra a safra. */
export function Bottle({ type, vintage, className = "" }: { type: string; vintage: number | null; className?: string }) {
  return (
    <svg viewBox="0 0 40 130" className={className} aria-hidden="true">
      <path
        d="M16 2h8v6h-1v26c0 8 9 10 9 22v66a4 4 0 0 1-4 4h-16a4 4 0 0 1-4-4v-66c0-12 9-14 9-22v-26h-1z"
        fill={TYPE_COLOR[type] ?? "var(--fg)"}
      />
      <rect x="16" y="2" width="8" height="13" className="fill-gold" />
      <rect x="8" y="72" width="24" height="30" className="fill-card" />
      <text x="20" y="90" textAnchor="middle" className="fill-fg text-[7px] font-semibold">{vintage ?? "NV"}</text>
    </svg>
  );
}

/** Foto real da garrafa quando existe; sem foto, cai na silhueta. A altura vem de className. */
export function WinePhoto({ wine, className = "" }: { wine: { name: string; photo: string | null; photoCredit?: string; type: string; vintage: number | null }; className?: string }) {
  if (!wine.photo) return <Bottle type={wine.type} vintage={wine.vintage} className={className} />;
  // eslint-disable-next-line @next/next/no-img-element -- arquivo servido pela nossa rota /fotos, já no tamanho de uso
  return <img src={`/fotos/${wine.photo}`} alt={`Garrafa de ${wine.name}`} title={wine.photoCredit || undefined} loading="lazy" className={`aspect-[2/3] rounded-xl object-cover ${className}`} />;
}
