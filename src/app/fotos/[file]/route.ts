import { readFile } from "node:fs/promises";
import { join } from "node:path";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Fotos das garrafas, guardadas em data/fotos. Públicas, como a vitrine. */
export async function GET(_: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  // só "<número>.<extensão>": nada de barras ou pontos que saiam da pasta
  const m = /^\d+\.(jpg|png|webp)$/.exec(file);
  if (!m) return new Response("Não encontrado", { status: 404 });
  try {
    const body = await readFile(join(process.cwd(), "data", "fotos", file));
    return new Response(new Uint8Array(body), { headers: { "Content-Type": TYPES[m[1]], "Cache-Control": "public, max-age=300" } });
  } catch {
    return new Response("Não encontrado", { status: 404 });
  }
}
