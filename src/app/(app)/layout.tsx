import Link from "next/link";
import { Suspense } from "react";
import { logout } from "@/app/actions";
import { Intro } from "@/components/intro";
import { NavLinks } from "@/components/nav-links";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/ui";
import { requireUser } from "@/lib/auth";

// toda a área interna depende da sessão; navegação resolve no servidor
export const instant = false;

const ROLE_LABEL = { admin: "Gestão", gerente: "Gerente", caixa: "Caixa" };

async function Shell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const manages = user.role !== "caixa";
  const links = [
    { href: "/", label: "Painel", icon: "painel" },
    { href: "/caixa", label: "Caixa", icon: "caixa" },
    ...(manages ? [{ href: "/vendas", label: "Vendas", icon: "vendas" }, { href: "/permutas", label: "Bonificações e permutas", icon: "permutas" }] : []),
    { href: "/estoque", label: "Estoque", icon: "estoque" },
    { href: "/clientes", label: "Clientes", icon: "clientes" },
    ...(manages
      ? [
          { href: "/fornecedores", label: "Fornecedores", icon: "fornecedores" },
          { href: "/custos", label: "Custos", icon: "custos" }, { href: "/despesas", label: "Despesas", icon: "despesas" }, { href: "/eventos", label: "Eventos", icon: "eventos" },
        ]
      : []),
    ...(user.role === "admin"
      ? [{ href: "/equipe", label: "Equipe", icon: "equipe" }, { href: "/config", label: "Configurações", icon: "config" }]
      : []),
    { href: "/consulta", label: "Consulta de preço", icon: "consulta" },
    { href: "/vitrine", label: "Vitrine", icon: "vitrine" },
  ];
  return (
    <div className="mx-auto flex max-w-[1560px] flex-col gap-4 p-4 lg:flex-row">
      <aside className="card flex shrink-0 flex-wrap items-center gap-3 lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:w-56 lg:flex-col lg:overflow-y-auto lg:flex-nowrap lg:items-stretch">
        <Link href="/" aria-label="Oasis Vinobar, painel" className="lg:py-5 lg:text-center"><Logo /></Link>
        <NavLinks links={links} />
        <div className="flex items-center gap-2 lg:mt-auto lg:flex-col lg:items-stretch">
          <div className="flex items-center gap-3 lg:tile">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gold text-sm font-semibold text-inverse-fg" aria-hidden="true">
              {user.name.slice(0, 2).toUpperCase()}
            </span>
            <span className="hidden min-w-0 lg:block">
              <span className="block truncate text-sm font-medium">{user.name}</span>
              <span className="block text-xs text-muted">{ROLE_LABEL[user.role]}</span>
            </span>
          </div>
          <ThemeToggle />
          <form action={logout} className="lg:contents"><button className="btn-ghost">Sair</button></form>
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Intro />
      <Suspense fallback={<p className="p-8 text-center text-sm text-muted">Carregando…</p>}>
        <Shell>{children}</Shell>
      </Suspense>
    </>
  );
}
