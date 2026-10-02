"use client";

import { Menu, Moon, RotateCcw, Sparkles, Sun, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";
import { isMissingSessionError } from "@/lib/auth-errors";

const AUTH_ROUTES = ["/login", "/register", "/forgot-password", "/update-password"];
const PROTECTED_ROUTES = ["/", "/learning", "/todos", "/github", "/settings"];
type Theme = "dark" | "light";

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");
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
    const saved = window.localStorage.getItem("toolkit-theme");
    const nextTheme: Theme = saved === "light" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("toolkit-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  };

  // Auto-close drawer on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

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
    <div className="min-h-screen md:flex">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[color:var(--border-subtle)] bg-[var(--surface-panel)] px-4 md:hidden">
        <button
          aria-label="Open menu"
          onClick={() => setOpen(true)}
          className="rounded-lg p-2 text-[color:var(--text-secondary)] hover:bg-[var(--control-hover)] focus-ring"
        >
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-brand-gradient text-white">
            <Sparkles size={14} strokeWidth={2.4} />
          </div>
          <span className="text-sm font-semibold">Toolkit</span>
        </div>
        <button
          type="button"
          aria-label={theme === "dark" ? "切换到日间样式" : "切换到夜间样式"}
          onClick={toggleTheme}
          className="rounded-lg p-2 text-[color:var(--text-secondary)] hover:bg-[var(--control-hover)] focus-ring"
        >
          {theme === "dark" ? <Moon size={18} /> : <Sun size={18} />}
        </button>
      </header>

      {/* Mobile drawer */}
      <div
        className={cn(
          "md:hidden fixed inset-0 z-40 transition",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!open}
      >
        <div
          onClick={() => setOpen(false)}
          className={cn(
            "absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity",
            open ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          className={cn(
            "absolute inset-y-0 left-0 w-72 max-w-[80vw] transition-transform",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <button
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-[color:var(--text-tertiary)] hover:bg-[var(--control-hover)] hover:text-[color:var(--text-primary)] focus-ring"
          >
            <X size={18} />
          </button>
          <Sidebar onNavigate={() => setOpen(false)} theme={theme} onToggleTheme={toggleTheme} />
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden md:block md:w-64 md:shrink-0 md:sticky md:top-0 md:h-screen">
        <Sidebar theme={theme} onToggleTheme={toggleTheme} />
      </div>

      <main className="flex-1 min-w-0">
        <div className="page-width px-4 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10">
          {children}
        </div>
      </main>
    </div>
  );
}
