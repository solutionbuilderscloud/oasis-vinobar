"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS: Record<string, string> = {
  painel: "M3 3h6v8H3zM11 3h6v5h-6zM11 10h6v7h-6zM3 13h6v4H3z",
  caixa: "M3 4h14v6H3zM2 10h16v7H2zM6 13.5h.01M10 13.5h.01M14 13.5h.01M6 7h8",
  vendas: "M5 2h10v16l-2.5-1.5L10 18l-2.5-1.5L5 18zM8 6h4M8 9.5h4M8 13h2",
  permutas: "M4 7h11l-3-3M16 13H5l3 3",
  clientes: "M10 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3.5 17.5a6.5 6.5 0 0 1 13 0",
  fornecedores: "M1.5 5h10v9h-10zM11.5 8h4l3 3v3h-7zM5 16.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM14.5 16.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  consulta: "M3 5v10M6 5v10M9 5v6M12 5v4M15 5v3M14.5 15.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM17 15l2 2",
  estoque: "M8 2h4v3l2 3v9a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V8l2-3zM6 11h8",
  custos: "M3 17V7M8 17V3M13 17v-6M18 17V9M2 17h17",
  despesas: "M3 5h14v11H3zM3 9h14M6 13h3",
  eventos: "M4 4h12v13H4zM4 8h12M7 2v4M13 2v4M8 12l1.5 1.5L12.5 10.5",
  equipe: "M7 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM1.5 17a5.5 5.5 0 0 1 11 0M14 9a2.5 2.5 0 1 0-1-4.8M14.5 12a4.5 4.5 0 0 1 4 5",
  config: "M10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM10 1v3M10 16v3M1 10h3M16 10h3M3.6 3.6l2.1 2.1M14.3 14.3l2.1 2.1M3.6 16.4l2.1-2.1M14.3 5.7l2.1-2.1",
  vitrine: "M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM2 10h16M10 2c2.5 2.5 2.5 13.5 0 16M10 2c-2.5 2.5-2.5 13.5 0 16",
};

export function NavLinks({ links }: { links: { href: string; label: string; icon: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-wrap gap-1 lg:flex-none lg:flex-col" aria-label="Seções">
      {links.map((l) => {
        const on = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} aria-current={on ? "page" : undefined}
            className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm ${on ? "bg-fg/10 font-semibold" : "text-muted hover:bg-fg/[0.06] hover:text-fg"}`}>
            <svg viewBox="0 0 20 20" className="size-4 shrink-0 fill-none stroke-current" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={ICONS[l.icon]} />
            </svg>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
