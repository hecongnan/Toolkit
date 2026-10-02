import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { AppShell } from "@/components/shell/AppShell";
import { readRuntimeEnv } from "@/lib/env";

export const metadata: Metadata = {
  title: "Toolkit · 个人效能空间",
  description:
    "整理学习资料、安排每日待办、理解 GitHub 项目。一个专注、清晰的个人工作区。",
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
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
