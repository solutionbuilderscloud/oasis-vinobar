import { connection } from "next/server";
import { saveRates } from "@/app/actions";
import { Flash } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getIvaPercent, getRateHistory, getRateInfo, getRateMode, getReorderParams } from "@/lib/data";
import { formatDay } from "@/lib/dates";

// lê a URL a cada acesso; navegação resolve no servidor
export const instant = false;

export default async function Config({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser("admin");
  await connection(); // o câmbio depende do dia de hoje
  const rates = await getRateInfo();
  const [mode, history, reorder, iva] = await Promise.all([getRateMode(), getRateHistory(), getReorderParams(), getIvaPercent()]);
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Configurações</h1>
      <Flash sp={await searchParams} />
      <form action={saveRates} className="card max-w-md space-y-4">
        <h2 className="text-sm font-semibold">Câmbio do dia</h2>
        <p className="text-sm text-muted">Preços são cadastrados em dólar. O câmbio é cravado uma vez por dia e vale para todas as telas e vendas daquele dia.</p>
        <p className="tile text-sm">Hoje: US$ 1 = <b>R$ {rates.brl.toLocaleString("pt-BR")}</b> = <b>₲ {rates.pyg.toLocaleString("pt-BR")}</b> <span className="text-muted">· {rates.source}</span></p>
        <div>
          <label className="label" htmlFor="mode">De onde vem o câmbio</label>
          <select className="input" id="mode" name="rate_mode" defaultValue={mode}>
            <option value="manual">Manual: eu digito abaixo e vale até eu trocar</option>
            <option value="auto">Automático: cotação de mercado, buscada todo dia</option>
          </select>
          <p className="mt-1 text-xs text-muted">No automático os dois campos abaixo são ignorados. A cotação de mercado costuma ser diferente da usada pelas casas de câmbio da cidade.</p>
        </div>
        <div><label className="label" htmlFor="brl">US$ 1 em reais (R$)</label><input className="input" id="brl" name="brl_per_usd" defaultValue={rates.brl} inputMode="decimal" required /></div>
        <div><label className="label" htmlFor="pyg">US$ 1 em guaranis (₲)</label><input className="input" id="pyg" name="pyg_per_usd" defaultValue={rates.pyg} inputMode="decimal" required /></div>
        <h2 className="pt-2 text-sm font-semibold">Reposição de estoque</h2>
        <p className="text-sm text-muted">O sistema avisa para repor quando o estoque cobre menos que o prazo de entrega mais a folga.</p>
        <div><label className="label" htmlFor="lead">Dias entre pedir e receber</label><input className="input" id="lead" name="lead_days" type="number" min={0} max={365} defaultValue={reorder.leadDays} required /></div>
        <div><label className="label" htmlFor="safety">Dias de folga de segurança</label><input className="input" id="safety" name="safety_days" type="number" min={0} max={365} defaultValue={reorder.safetyDays} required /></div>
        <h2 className="pt-2 text-sm font-semibold">Imposto</h2>
        <p className="text-sm text-muted">O preço de prateleira já inclui o IVA. No caixa, a venda marcada como turista estrangeiro sai sem ele. Confirme a regra com seu contador.</p>
        <div><label className="label" htmlFor="iva">IVA embutido no preço (%)</label><input className="input" id="iva" name="iva_percent" defaultValue={iva} inputMode="decimal" required /></div>
        <button className="btn">Salvar</button>
      </form>
      <section className="card mt-4 max-w-md">
        <h2 className="mb-2 text-sm font-semibold">Câmbio dos últimos dias</h2>
        <table className="w-full"><thead><tr><th className="th">Dia</th><th className="th text-right">R$</th><th className="th text-right">₲</th><th className="th text-right">Origem</th></tr></thead>
          <tbody>{history.map((h) => <tr key={h.day}><td className="td">{formatDay(h.day, { day: "numeric", month: "short" })}</td><td className="td text-right tabular-nums">{h.brl.toLocaleString("pt-BR")}</td><td className="td text-right tabular-nums">{h.pyg.toLocaleString("pt-BR")}</td><td className="td text-right text-xs text-muted">{h.source}</td></tr>)}</tbody>
        </table>
      </section>
    </>
  );
}
