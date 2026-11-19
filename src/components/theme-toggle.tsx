"use client";

export function ThemeToggle() {
  return (
    <button
      type="button"
      className="btn-ghost"
      aria-label="Alternar tema claro/escuro"
      onClick={() => {
        const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("theme", next);
        } catch {}
      }}
    >
      ◐ Tema
    </button>
  );
}
