"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  BookOpen,
  CheckCircle2,
  Github,
  LogOut,
  Moon,
  Sparkles,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/learning", label: "学习资料", icon: BookOpen },
  { href: "/todos", label: "Todo", icon: CheckCircle2 },
  { href: "/github", label: "GitHub 分析", icon: Github },
] as const;

interface SidebarProps {
  onNavigate?: () => void;
  theme?: "dark" | "light";
  onToggleTheme?: () => void;
}

export function Sidebar({ onNavigate, theme = "dark", onToggleTheme }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    try {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data }) => {
        setEmail(data.user?.email ?? null);
      });
    } catch {
      setEmail(null);
    }
  }, []);

  const signOut = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } finally {
      onNavigate?.();
      router.replace("/login");
      router.refresh();
    }
  };

  return (
    <aside className="flex h-full w-full flex-col gap-2 border-r border-[color:var(--border-subtle)] bg-[var(--surface-panel)] px-4 py-5 backdrop-blur-2xl">
      <Link
        href="/"
        onClick={onNavigate}
        className="mb-4 flex items-center gap-3 px-2 py-1 focus-ring rounded-lg"
      >
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-gradient text-white shadow-glow">
          <Sparkles size={18} strokeWidth={2.4} />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-wide text-[color:var(--text-primary)]">Toolkit</p>
          <p className="text-[11px] text-[color:var(--text-muted)]">个人效能空间</p>
        </div>
      </Link>

      <nav className="mt-2 flex flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition focus-ring",
                active
                  ? "bg-[var(--control-active)] text-[color:var(--text-primary)]"
                  : "text-[color:var(--text-tertiary)] hover:bg-[var(--control-hover)] hover:text-[color:var(--text-primary)]",
              )}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-gradient"
                />
              )}
              <Icon
                size={18}
                className={cn(
                  "shrink-0 transition",
                  active
                    ? "text-fuchsia-300"
                    : "text-zinc-500 group-hover:text-zinc-300",
                )}
              />
              <span className="font-medium">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3 px-2 py-3">
        <button
          type="button"
          onClick={onToggleTheme}
          className="flex w-full items-center justify-between rounded-xl border border-[color:var(--border-default)] bg-[var(--control-bg)] px-3 py-2 text-left text-xs font-medium text-[color:var(--text-secondary)] transition hover:bg-[var(--control-hover)] hover:text-[color:var(--text-primary)] focus-ring"
        >
          <span className="inline-flex items-center gap-2">
            {theme === "light" ? <Sun size={14} /> : <Moon size={14} />}
            {theme === "light" ? "日间样式" : "夜间样式"}
          </span>
          <span className="text-[10px] text-[color:var(--text-faint)]">切换</span>
        </button>
        <div className="min-w-0 rounded-xl border border-[color:var(--border-default)] bg-[var(--control-bg)] px-3 py-2">
          <p className="text-[11px] text-[color:var(--text-muted)]">当前账号</p>
          <p className="truncate text-xs font-medium text-[color:var(--text-secondary)]">
            {email ?? "已登录"}
          </p>
        </div>
        <button
          type="button"
          onClick={signOut}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-[color:var(--text-tertiary)] transition hover:bg-[var(--control-hover)] hover:text-[color:var(--text-primary)] focus-ring"
        >
          <LogOut size={14} />
          退出登录
        </button>
        <p className="text-[11px] text-[color:var(--text-faint)]">v0.2 · 云端同步</p>
      </div>
    </aside>
  );
}
