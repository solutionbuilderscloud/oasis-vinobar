"use client";

const BOTTLE = "M16 2h8v6h-1v26c0 8 9 10 9 22v66a4 4 0 0 1-4 4h-16a4 4 0 0 1-4-4v-66c0-12 9-14 9-22v-26h-1z";

/** Abertura do sistema, uma vez por sessão do navegador. Toque ou qualquer tecla pula. A animação é toda CSS (globals.css). */
export function Intro() {
  const seen = () => {
    try { sessionStorage.setItem("intro", "1"); } catch {}
    document.documentElement.dataset.intro = "seen";
  };
  return (
    <div className="intro" role="presentation" onClick={seen} onAnimationEnd={(e) => e.animationName === "intro-out" && seen()}
      ref={(el) => {
        // qualquer tecla pula; sai junto com o componente
        if (!el) return;
        window.addEventListener("keydown", seen, { once: true });
        return () => window.removeEventListener("keydown", seen);
      }}>
      <svg className="intro-bottle" viewBox="0 0 40 130" aria-hidden="true">
        <clipPath id="intro-glass"><path d={BOTTLE} /></clipPath>
        <g clipPath="url(#intro-glass)">
          <g className="intro-wine">
            {/* a crista ondulada desliza de lado enquanto o nível sobe */}
            <path className="intro-wave" d="M0 3 q5 -3 10 0 t10 0 t10 0 t10 0 t10 0 t10 0 V140 H0z" />
          </g>
        </g>
        <path className="intro-line" d={BOTTLE} pathLength={1} />
      </svg>
      <p className="intro-name" aria-hidden="true"><b>OASIS</b><span>VINOBAR</span></p>
    </div>
  );
}
