export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex flex-col items-center leading-none ${className}`}>
      <span className="text-xl font-light tracking-[0.35em]">OASIS</span>
      <span className="mt-1 text-[0.55rem] tracking-[0.45em]">VINOBAR</span>
    </span>
  );
}

type SP = Record<string, string | string[] | undefined>;

/** Mostra ?erro= e ?ok= deixados pelas actions. */
export function Flash({ sp }: { sp: SP }) {
  const erro = typeof sp.erro === "string" ? sp.erro : null;
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  if (!erro && !ok) return null;
  return (
    <p role={erro ? "alert" : "status"} className={`mb-4 rounded-2xl px-4 py-3 text-sm ${erro ? "bg-wine text-white" : "bg-card"}`}>
      {erro ?? ok}
    </p>
  );
}
