import { Flash } from "@/components/ui";
import { WineForm } from "@/components/wine-form";
import { requireUser } from "@/lib/auth";
import { getRegions } from "@/lib/data";

// lê a URL a cada acesso; navegação resolve no servidor
export const instant = false;

export default async function NovoVinho({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser("admin", "gerente");
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Novo vinho</h1>
      <Flash sp={await searchParams} />
      <WineForm regionList={await getRegions()} showCost />
    </>
  );
}
