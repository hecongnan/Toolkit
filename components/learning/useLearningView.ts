"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MaterialSort } from "@/lib/materials";
import type { MaterialStatus } from "@/lib/types";

export interface LearningView {
  query: string;
  status: MaterialStatus | "all";
  category: string;
  sort: MaterialSort;
}
const defaults: LearningView = { query: "", status: "all", category: "", sort: "newest" };
const params = ["q", "status", "category", "sort"];

function normalize(value: Partial<LearningView>): LearningView {
  return { query: typeof value.query === "string" ? value.query : "", category: typeof value.category === "string" ? value.category : "",
    status: ["all", "todo", "doing", "done"].includes(value.status ?? "") ? value.status! : "all",
    sort: ["newest", "priority", "updated"].includes(value.sort ?? "") ? value.sort! : "newest" };
}
function fromUrl(): LearningView {
  const search = new URLSearchParams(window.location.search);
  return normalize({ query: search.get("q") ?? "", category: search.get("category") ?? "", status: search.get("status") as LearningView["status"], sort: search.get("sort") as MaterialSort });
}

export function useLearningView(userId: string | null, loading: boolean) {
  const [view, setView] = useState<LearningView>(defaults);
  const [ready, setReady] = useState(false);
  const viewRef = useRef(view);
  const scrollRef = useRef(0);
  const restoredRef = useRef(false);
  const leavingRef = useRef(false);
  const key = userId ? `toolkit:learning-view:${userId}` : null;

  useEffect(() => {
    if (!key) return;
    let saved: { view?: Partial<LearningView>; scroll?: number } | null = null;
    try { saved = JSON.parse(window.sessionStorage.getItem(key) ?? "null"); } catch { /* optional view memory */ }
    const hasUrlView = params.some((param) => new URLSearchParams(window.location.search).has(param));
    const next = hasUrlView ? fromUrl() : normalize(saved?.view ?? defaults);
    // A shared link wins over tab memory. Only the same view gets its old position.
    const sameView = JSON.stringify(next) === JSON.stringify(normalize(saved?.view ?? defaults));
    scrollRef.current = sameView && typeof saved?.scroll === "number" && Number.isFinite(saved.scroll) ? Math.max(0, saved.scroll) : 0;
    viewRef.current = next;
    restoredRef.current = false;
    leavingRef.current = false;
    setView(next);
    setReady(true);
  }, [key]);

  useEffect(() => {
    if (!key || !ready) return;
    const persist = () => {
      try { window.sessionStorage.setItem(key, JSON.stringify({ view: viewRef.current, scroll: scrollRef.current })); } catch { /* filtering still works */ }
    };
    const scroll = () => {
      if (!restoredRef.current || leavingRef.current) return;
      scrollRef.current = window.scrollY;
      persist();
    };
    const navigate = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.target === "_blank" || event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin === window.location.origin && url.pathname !== "/learning") { persist(); leavingRef.current = true; }
    };
    const pop = () => {
      if (window.location.pathname !== "/learning") { persist(); leavingRef.current = true; return; }
      const next = fromUrl();
      viewRef.current = next;
      scrollRef.current = 0;
      setView(next);
      persist();
    };
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("pagehide", persist);
    window.addEventListener("popstate", pop);
    document.addEventListener("click", navigate, true);
    return () => {
      persist();
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("pagehide", persist);
      window.removeEventListener("popstate", pop);
      document.removeEventListener("click", navigate, true);
    };
  }, [key, ready]);

  useEffect(() => {
    if (!ready || !key || window.location.pathname !== "/learning") return;
    viewRef.current = view;
    const url = new URL(window.location.href);
    for (const param of params) url.searchParams.delete(param);
    if (view.query) url.searchParams.set("q", view.query);
    if (view.category) url.searchParams.set("category", view.category);
    if (view.status !== "all") url.searchParams.set("status", view.status);
    if (view.sort !== "newest") url.searchParams.set("sort", view.sort);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    try { window.sessionStorage.setItem(key, JSON.stringify({ view, scroll: scrollRef.current })); } catch { /* no storage requirement */ }
  }, [view, ready, key]);

  useEffect(() => {
    if (loading || !ready || restoredRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: scrollRef.current, behavior: "instant" });
      restoredRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loading, ready]);

  const update = useCallback((patch: Partial<LearningView>) => setView((previous) => normalize({ ...previous, ...patch })), []);
  return { view, update, ready };
}
