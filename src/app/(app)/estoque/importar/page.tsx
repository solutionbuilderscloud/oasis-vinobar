import { importCsv } from "@/app/actions";
import { Flash } from "@/components/ui";
import { requireUser } from "@/lib/auth";

// lê a URL a cada acesso; navegação resolve no servidor
export const instant = false;

export default async function Importar({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser("admin", "gerente");
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Importar planilha</h1>
      <Flash sp={await searchParams} />
      <form action={importCsv} className="card space-y-4">
        <p className="text-sm text-muted">
          No Excel: Salvar como → CSV UTF-8. Primeira linha com os nomes das colunas.
          Obrigatórias: <b>nome</b>, <b>regiao</b>, <b>preco</b>. Opcionais: produtor, subregiao, uva, safra, tipo, custo,
          estoque, estoque minimo, codigo de barras. Preços em dólar. Se uma linha tiver erro, nada é importado.
        </p>
        <div>
          <label className="label" htmlFor="file">Arquivo CSV</label>
          <input className="input" id="file" name="file" type="file" accept=".csv,text/csv" required />
        </div>
        <button className="btn">Importar</button>
      </form>
    </>
  );
}
