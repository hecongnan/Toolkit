import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AppShell } from "@/components/shell/AppShell";
import { readRuntimeEnv } from "@/lib/env";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Toolkit · 个人效能空间",
  description:
    "学习资料整理、每日 todo、GitHub 仓库 AI 分析 —— 高端简洁的个人效能小工具。",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const runtimeConfig = JSON.stringify({
    supabaseUrl: readRuntimeEnv("NEXT_PUBLIC_SUPABASE_URL") ?? "",
    supabaseAnonKey: readRuntimeEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") ?? "",
  }).replace(/</g, "\\u003c");

  return (
    <html lang="zh-CN" className={`${inter.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <body>
        <script
          id="runtime-config"
          dangerouslySetInnerHTML={{
            __html: `window.__TOOLKIT_CONFIG__=${runtimeConfig}`,
          }}
        />
        <Script id="theme-init" strategy="beforeInteractive">
          {`try{var theme=localStorage.getItem('toolkit-theme');document.documentElement.dataset.theme=theme==='light'?'light':'dark'}catch{document.documentElement.dataset.theme='dark'}`}
        </Script>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
