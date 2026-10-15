import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { AppShell } from "@/components/shell/AppShell";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { readRuntimeEnv } from "@/lib/env";

export const metadata: Metadata = {
  title: "Toolkit · 个人行动工作台",
  description:
    "安排一周计划，完成每日待办，回顾并调整下一步。让计划与行动连在一起。",
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f5f5f7" }, { media: "(prefers-color-scheme: dark)", color: "#161618" }],
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
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <script
          id="runtime-config"
          dangerouslySetInnerHTML={{
            __html: `window.__TOOLKIT_CONFIG__=${runtimeConfig}`,
          }}
        />
        <Script id="theme-init" strategy="beforeInteractive">
          {`try{var theme=localStorage.getItem('toolkit-theme');document.documentElement.dataset.theme=theme==='light'||theme==='dark'?theme:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch{document.documentElement.dataset.theme='light'}`}
        </Script>
        <AuthProvider><AppShell>{children}</AppShell></AuthProvider>
      </body>
    </html>
  );
}
