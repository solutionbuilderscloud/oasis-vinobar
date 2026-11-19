import { Suspense } from "react";
import { login } from "@/app/actions";
import { Intro } from "@/components/intro";
import { Flash, Logo } from "@/components/ui";

async function Erro({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Flash sp={await searchParams} />;
}

export default function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Intro />
      <div className="w-full max-w-sm">
        <div className="card-wine mb-4 flex justify-center py-10">
          <Logo />
        </div>
        <form action={login} className="card space-y-4">
          <Suspense>
            <Erro searchParams={searchParams} />
          </Suspense>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input className="input" id="email" name="email" type="email" autoComplete="username" required />
          </div>
          <div>
            <label className="label" htmlFor="password">Senha</label>
            <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <button className="btn w-full">Entrar</button>
        </form>
      </div>
    </main>
  );
}
