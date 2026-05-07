"use client";

import { Menu, Sparkles, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { cn } from "@/lib/cn";

const AUTH_ROUTES = ["/login", "/register"];

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const isAuthRoute = AUTH_ROUTES.some((route) => pathname?.startsWith(route));

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

  return (
    <div className="min-h-screen md:flex">
      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/5 bg-zinc-950/80 px-4 backdrop-blur-xl">
        <button
          aria-label="Open menu"
          onClick={() => setOpen(true)}
          className="rounded-lg p-2 text-zinc-300 hover:bg-white/5 focus-ring"
        >
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-brand-gradient text-white">
            <Sparkles size={14} strokeWidth={2.4} />
          </div>
          <span className="text-sm font-semibold">Toolkit</span>
        </div>
        <span className="w-9" />
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
            className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100 focus-ring"
          >
            <X size={18} />
          </button>
          <Sidebar onNavigate={() => setOpen(false)} />
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden md:block md:w-60 md:shrink-0 md:sticky md:top-0 md:h-screen">
        <Sidebar />
      </div>

      <main className="flex-1 min-w-0">
        <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
          {children}
        </div>
      </main>
    </div>
  );
}
