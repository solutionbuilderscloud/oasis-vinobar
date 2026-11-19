import { geoNaturalEarth1, geoPath } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import world from "world-atlas/countries-110m.json";

export const MAP_W = 1000;
export const MAP_H = 470;

const topo = world as unknown as Topology<{ countries: GeometryCollection }>;
const all = feature(topo, topo.objects.countries) as FeatureCollection<Geometry>;
// sem a Antártida o mapa aproveita melhor a altura
const countries = { ...all, features: all.features.filter((f) => f.id !== "010") };
const projection = geoNaturalEarth1().fitSize([MAP_W, MAP_H], countries);
const path = geoPath(projection).digits(1);

export const landPath = path(countries) ?? "";
const byIso = new Map(countries.features.map((f) => [String(f.id), path(f) ?? ""]));

export const countryPath = (iso: string) => byIso.get(iso) ?? "";
export const project = (lon: number, lat: number) => projection([lon, lat]) ?? [0, 0];
