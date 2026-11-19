import { createUser, setUserActive } from "@/app/actions";
import { Flash } from "@/components/ui";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";

const ROLES = [
  { value: "caixa", label: "Caixa — consulta estoque, sem custos" },
  { value: "gerente", label: "Gerente — estoque, cadastro e custos" },
  { value: "admin", label: "Gestão — acesso total" },
];

// lê a URL a cada acesso; navegação resolve no servidor
export const instant = false;

export default async function Equipe({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireUser("admin");
  const list = await db.select().from(users).orderBy(users.name);
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Equipe</h1>
      <Flash sp={await searchParams} />
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <table className="w-full">
            <thead><tr><th className="th">Nome</th><th className="th">Email</th><th className="th">Cargo</th><th className="th" /></tr></thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id} className={u.active ? "" : "opacity-50"}>
                  <td className="td font-medium">{u.name}</td>
                  <td className="td text-muted">{u.email}</td>
                  <td className="td"><span className="badge">{u.role}</span></td>
                  <td className="td text-right">
                    {u.id !== me.id && (
                      <form action={setUserActive}>
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="active" value={u.active ? "0" : "1"} />
                        <button className="btn-ghost">{u.active ? "Desativar" : "Reativar"}</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <form action={createUser} className="card space-y-3">
          <h2 className="text-sm font-semibold">Novo usuário</h2>
          <div><label className="label" htmlFor="name">Nome</label><input className="input" id="name" name="name" required /></div>
          <div><label className="label" htmlFor="email">Email</label><input className="input" id="email" name="email" type="email" required /></div>
          <div><label className="label" htmlFor="password">Senha (mín. 8)</label><input className="input" id="password" name="password" type="password" minLength={8} autoComplete="new-password" required /></div>
          <div>
            <label className="label" htmlFor="role">Cargo</label>
            <select className="input" id="role" name="role">{ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select>
          </div>
          <button className="btn">Criar</button>
        </form>
      </div>
    </>
  );
}
