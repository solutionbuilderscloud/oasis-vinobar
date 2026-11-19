import { saveWine } from "@/app/actions";
import { WINE_TYPES, type regions, type wines } from "@/db/schema";

type Wine = typeof wines.$inferSelect;
const money = (cents: number) => (cents / 100).toFixed(2);

export function WineForm({ wine, regionList, showCost }: { wine?: Wine; regionList: (typeof regions.$inferSelect)[]; showCost: boolean }) {
  const field = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input className="input" id={name} name={name} {...props} />
    </div>
  );
  return (
    <form action={saveWine} className="card grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {wine && <input type="hidden" name="id" value={wine.id} />}
      <div className="sm:col-span-2">{field("name", "Nome", { defaultValue: wine?.name, required: true })}</div>
      {field("producer", "Produtor", { defaultValue: wine?.producer })}
      <div>
        <label className="label" htmlFor="regionId">Região</label>
        <select className="input" id="regionId" name="regionId" defaultValue={wine?.regionId} required>
          {regionList.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>
      {field("subregion", "Sub-região", { defaultValue: wine?.subregion, placeholder: "Toscana, Mendoza…" })}
      {field("grape", "Uva", { defaultValue: wine?.grape })}
      {field("vintage", "Safra", { defaultValue: wine?.vintage ?? "", inputMode: "numeric", placeholder: "vazio = sem safra" })}
      <div>
        <label className="label" htmlFor="type">Tipo</label>
        <select className="input" id="type" name="type" defaultValue={wine?.type ?? "tinto"}>
          {WINE_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
      {field("barcode", "Código de barras", { defaultValue: wine?.barcode ?? "", placeholder: "bipe com o leitor" })}
      {field("price", "Preço de venda (US$)", { defaultValue: wine ? money(wine.priceCents) : "", inputMode: "decimal", required: true })}
      {showCost
        ? field("cost", "Custo (US$)", { defaultValue: wine ? money(wine.costCents) : "", inputMode: "decimal" })
        : wine && <input type="hidden" name="cost" value={money(wine.costCents)} />}
      {field("minStock", "Estoque mínimo (alerta)", { defaultValue: wine?.minStock ?? 0, type: "number", min: 0 })}
      {!wine && field("stock", "Estoque inicial", { defaultValue: 0, type: "number", min: 0 })}
      <div className="sm:col-span-2">
        <label className="label" htmlFor="photo">Foto da garrafa {wine?.photo && "(já tem; enviar outra substitui)"}</label>
        <input className="input" id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" />
      </div>
      {field("photoCredit", "Crédito da foto", { defaultValue: wine?.photoCredit, placeholder: "vazio se a foto é da loja" })}
      <div className="flex items-end sm:col-span-2 lg:col-span-3">
        <button className="btn">{wine ? "Salvar alterações" : "Cadastrar vinho"}</button>
      </div>
    </form>
  );
}
