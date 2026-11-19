import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { GlassPointer } from "@/components/glass-pointer";
import "./globals.css";

const sans = Inter({ variable: "--font-sans-face", subsets: ["latin"] });

export const metadata: Metadata = { title: "Oasis Vinobar", description: "Sistema de gestão Oasis Vinobar" };

// roda antes da pintura para não piscar o tema errado
// a abertura toca uma vez por sessão do navegador; marcar antes da pintura evita que ela pisque em toda página
const themeScript = `try{var t=localStorage.getItem("theme")||"dark";document.documentElement.dataset.theme=t;if(sessionStorage.getItem("intro"))document.documentElement.dataset.intro="seen"}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${sans.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full font-sans">
        {children}
        <GlassPointer />
      </body>
    </html>
  );
}
