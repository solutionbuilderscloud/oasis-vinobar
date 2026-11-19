import { normalize } from "./csv.ts";

/** Cor do vidro/vinho por tipo. Usada na garrafa da vitrine e nos gráficos. */
export const TYPE_COLOR: Record<string, string> = {
  tinto: "var(--wine)",
  branco: "#cdbf84",
  rosé: "#dba39b",
  espumante: "#9aa79b",
  sobremesa: "#c9963f",
  fortificado: "#5a3328",
};

type RegionMeta = {
  slug: string;
  /** código ISO numérico do país no world-atlas */
  iso: string;
  lon: number;
  lat: number;
  /** para onde o rótulo foge do marcador, em px do mapa */
  label: { dx: number; dy: number; anchor: "start" | "end" | "middle" };
  blurb: string;
};

const META: Record<string, RegionMeta> = {
  italia: { slug: "italia", iso: "380", lon: 12.5, lat: 43, label: { dx: 12, dy: 4, anchor: "start" }, blurb: "Sangiovese na Toscana, Nebbiolo no Piemonte, Corvina no Vêneto." },
  espanha: { slug: "espanha", iso: "724", lon: -3.7, lat: 40.2, label: { dx: -12, dy: 4, anchor: "end" }, blurb: "Tempranillo de Rioja e Ribera del Duero, Albariño da Galícia." },
  franca: { slug: "franca", iso: "250", lon: 2.5, lat: 46.8, label: { dx: 0, dy: -14, anchor: "middle" }, blurb: "Bordeaux, Borgonha, Champagne, Rhône e Provence." },
  argentina: { slug: "argentina", iso: "032", lon: -66, lat: -33, label: { dx: 12, dy: 4, anchor: "start" }, blurb: "Malbec de altitude em Mendoza, Torrontés em Salta." },
  chile: { slug: "chile", iso: "152", lon: -71.5, lat: -35, label: { dx: -12, dy: 4, anchor: "end" }, blurb: "Cabernet e Carménère entre os Andes e o Pacífico." },
  africadosul: { slug: "africa-do-sul", iso: "710", lon: 19, lat: -33.5, label: { dx: 0, dy: 20, anchor: "middle" }, blurb: "Pinotage e Chenin Blanc de Stellenbosch e Swartland." },
  napavalley: { slug: "napa-valley", iso: "840", lon: -122.3, lat: 38.5, label: { dx: 12, dy: 4, anchor: "start" }, blurb: "Cabernet Sauvignon da Califórnia." },
  australia: { slug: "australia", iso: "036", lon: 138.6, lat: -34.5, label: { dx: 0, dy: 20, anchor: "middle" }, blurb: "Shiraz de Barossa e McLaren Vale." },
};

/** Região cadastrada sem entrada aqui simplesmente não aparece no mapa. */
export const regionMeta = (name: string): RegionMeta | undefined => META[normalize(name)];
