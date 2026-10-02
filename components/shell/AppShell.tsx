"use client";

import { Menu, Moon, RotateCcw, Sun, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Modal } from "@/components/ui/Modal";
import { createClient } from "@/lib/supabase/client";
import { isMissingSessionError } from "@/lib/auth-errors";

const AUTH_ROUTES = ["/login", "/register", "/forgot-password", "/update-password"];
const PROTECTED_ROUTES = ["/", "/learning", "/todos", "/github", "/settings"];
type Theme = "dark" | "light";

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const [authStatus, setAuthStatus] = useState<"checking" | "ready" | "error">("checking");
  const [authRetry, setAuthRetry] = useState(0);
  const pathname = usePathname();
  const router = useRouter();

  const isAuthRoute = AUTH_ROUTES.some((route) => pathname?.startsWith(route));
  const isProtectedRoute = PROTECTED_ROUTES.some((route) =>
    route === "/" ? pathname === "/" : pathname?.startsWith(route),
  );

  // EdgeOne Pages can run Next.js API routes, but its middleware runtime can
  // terminate the request before a response is produced. Keep route protection
  // in the browser while API routes continue to validate the Supabase cookie.
  useEffect(() => {
    let active = true;
    setAuthStatus("checking");

    try {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data: { user }, error }) => {
        if (!active) return;
        if (error && !isMissingSessionError(error)) throw error;
        if (!user && isProtectedRoute) {
          const next = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
          router.replace(`/login${next}`);
          return;
        }
        if (user && isAuthRoute && pathname !== "/update-password") {
          router.replace("/");
          return;
        }
        setAuthStatus("ready");
      }).catch(() => {
        if (active) setAuthStatus("error");
      });
    } catch {
      setAuthStatus("error");
    }

    return () => {
      active = false;
    };
  }, [authRetry, isAuthRoute, isProtectedRoute, pathname, router]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      let saved: string | null = null;
      try { saved = window.localStorage.getItem("toolkit-theme"); } catch { /* storage can be unavailable */ }
      const nextTheme = saved === "light" || saved === "dark" ? saved : media.matches ? "dark" : "light";
      setTheme(nextTheme);
      document.documentElement.dataset.theme = nextTheme;
    };
    sync();
    media.addEventListener("change", sync);
    const keyboard = (event: KeyboardEvent) => { if (!event.metaKey && !event.ctrlKey && !event.altKey) document.documentElement.dataset.input = "keyboard"; };
    const pointer = () => { document.documentElement.dataset.input = "pointer"; };
    window.addEventListener("keydown", keyboard, true);
    window.addEventListener("pointerdown", pointer, true);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("keydown", keyboard, true);
      window.removeEventListener("pointerdown", pointer, true);
    };
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { window.localStorage.setItem("toolkit-theme", next); } catch { /* theme still changes without storage */ }
  };

  // Auto-close drawer on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const closeDesktopDrawer = () => { if (media.matches) setOpen(false); };
    media.addEventListener("change", closeDesktopDrawer);
    return () => media.removeEventListener("change", closeDesktopDrawer);
  }, []);

  if (isAuthRoute) {
    return <>{children}</>;
  }

  if (isProtectedRoute && authStatus !== "ready") {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--surface-page)] px-5 text-center text-sm text-[color:var(--text-muted)]">
        {authStatus === "checking" ? (
          <p>正在检查登录状态...</p>
        ) : (
          <div className="space-y-3">
            <p className="font-medium text-[color:var(--text-primary)]">暂时无法确认登录状态</p>
            <p>请检查网络连接，然后重试。</p>
            <button
              type="button"
              onClick={() => setAuthRetry((value) => value + 1)}
              className="mx-auto flex items-center gap-2 rounded-lg border border-[color:var(--border-default)] px-4 py-2 text-[color:var(--text-primary)] focus-ring"
            >
              <RotateCcw size={14} /> 重试
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-dvh md:flex">
      <a href="#main-content" className="skip-link focus-ring">跳到主要内容</a>
      <Modal open={open} onClose={() => setOpen(false)} title="工作区导航" presentation="drawer">
        <Sidebar onNavigate={() => setOpen(false)} theme={theme} onToggleTheme={toggleTheme} />
      </Modal>
      <div className="hidden md:sticky md:top-0 md:block md:h-dvh md:w-60 md:shrink-0">
        <Sidebar theme={theme} onToggleTheme={toggleTheme} />
      </div>
      <div className="min-w-0 flex-1">
        <header className="chrome sticky top-0 z-30 flex h-16 items-center justify-between gap-3 px-4 sm:px-8 lg:px-10">
          <div className="flex min-w-0 items-center gap-2">
            <button type="button" aria-label="打开导航" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className="button icon-button focus-ring md:hidden"><Menu size={20} /></button>
            <span className="hidden text-xs text-[color:var(--text-muted)] sm:inline">工作区</span>
            <ChevronRight size={12} className="hidden text-[color:var(--text-faint)] sm:block" aria-hidden />
            <span className="truncate text-sm font-medium">{pathname === "/" ? "概览" : pathname?.startsWith("/todos") ? "每日待办" : pathname?.startsWith("/learning") ? "学习资料" : pathname?.startsWith("/github") ? "项目分析" : "AI 设置"}</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/settings" className="quiet-link hidden rounded-lg text-xs focus-ring sm:inline">管理 AI 配置</Link>
            <button type="button" aria-label={theme === "dark" ? "切换到日间样式" : "切换到夜间样式"} onClick={toggleTheme} className="button icon-button focus-ring md:hidden">{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="outline-none">
        <div className="page-width px-4 pb-12 pt-7 sm:px-8 sm:pt-9 lg:px-10 lg:pt-11">
          {children}
        </div>
        </main>
      </div>
    </div>
  );
}
