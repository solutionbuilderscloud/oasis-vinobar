"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// shortcut: busca preços e estoque a cada 15 s em vez de receber na hora; trocar por SSE se 15 s for lento demais na loja
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
