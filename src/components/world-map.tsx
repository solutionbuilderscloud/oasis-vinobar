import Link from "next/link";
import { regionMeta } from "@/lib/wine-meta";
import { countryPath, landPath, MAP_H, MAP_W, project } from "@/lib/worldmap";

const vitrineHref = (slug: string | null) => (slug ? `/vitrine?regiao=${slug}` : "/vitrine");

export type MapRegion = { name: string; bottles: number; labels: number };

/** Mapa-múndi com um marcador clicável por região. `active` = slug da região selecionada. */
export function WorldMap({ regions, active, href = vitrineHref }: { regions: MapRegion[]; active?: string; href?: (slug: string | null) => string }) {
  const points = regions.flatMap((r) => {
    const meta = regionMeta(r.name);
    if (!meta) return [];
    const [x, y] = project(meta.lon, meta.lat);
    return [{ ...r, meta, x, y }];
  });
  return (
    <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="h-auto w-full" role="group" aria-label="Mapa das regiões de vinho">
      <path d={landPath} className="fill-line" />
      {points.map((p) => (
        <path key={p.meta.iso} d={countryPath(p.meta.iso)}
          className={`fill-wine transition-opacity ${!active || active === p.meta.slug ? "opacity-80" : "opacity-30"}`} />
      ))}
      {points.map((p) => {
        const on = active === p.meta.slug;
        return (
          <Link key={p.meta.slug} href={href(on ? null : p.meta.slug)} scroll={false}
            aria-label={`${p.name}: ${p.labels} rótulos`} aria-current={on ? "true" : undefined} className="map-pin group">
            {/* área de toque generosa para tablet */}
            <circle cx={p.x} cy={p.y} r={22} fill="transparent" />
            <circle cx={p.x} cy={p.y} r={7} className={`map-pulse fill-none ${on ? "stroke-gold" : "stroke-fg"}`} strokeWidth={1.5} />
            <circle cx={p.x} cy={p.y} r={on ? 7 : 5} className={`${on ? "fill-gold" : "fill-fg"} stroke-bg`} strokeWidth={2} />
              <text x={p.x + p.meta.label.dx} y={p.y + p.meta.label.dy} textAnchor={p.meta.label.anchor}
                className={`fill-fg text-[13px] group-hover:underline ${on ? "font-semibold" : ""}`}>
                {p.name}
              </text>
          </Link>
        );
      })}
    </svg>
  );
}
