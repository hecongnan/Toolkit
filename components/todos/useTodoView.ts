"use client";

import { useCallback, useEffect, useState, type SetStateAction } from "react";
import { isDateKey, todayKey } from "@/lib/todo-dates";

interface TodoView {
  date: string;
  query: string;
  followsToday: boolean;
}

export function useTodoView(userId: string | undefined) {
  const key = userId ? `toolkit:todo-view:${userId}` : null;
  const [view, setView] = useState<TodoView>(() => ({ date: todayKey(), query: "", followsToday: true }));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!key) return;
    const today = todayKey();
    let next: TodoView = { date: today, query: "", followsToday: true };
    // Next.js can render the destination before committing its browser URL.
    // Restore after navigation commits, and keep task reads gated until ready.
    const params = new URLSearchParams(window.location.search);
    if (params.has("date") || params.has("q")) {
      const requested = params.get("date");
      const date = requested && isDateKey(requested) ? requested : today;
      next = { date, query: params.get("q") ?? "", followsToday: date === today };
      // Consume entry instructions so reload remembers later user choices.
      const url = new URL(window.location.href);
      url.searchParams.delete("date");
      url.searchParams.delete("q");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    } else {
      try {
        const saved = JSON.parse(window.sessionStorage.getItem(key) ?? "null");
        if (saved?.version === 1 && typeof saved.query === "string" && typeof saved.followsToday === "boolean" && typeof saved.date === "string" && isDateKey(saved.date)) {
          next = { date: saved.followsToday ? today : saved.date, query: saved.query, followsToday: saved.followsToday };
        }
      } catch { /* Optional view memory cannot block the task page. */ }
    }
    setView(next);
    setReady(true);
  }, [key]);

  useEffect(() => {
    if (!key || !ready) return;
    try { window.sessionStorage.setItem(key, JSON.stringify({ version: 1, ...view })); } catch { /* Navigation and search still work without storage. */ }
  }, [key, view, ready]);

  const setDate = useCallback((next: SetStateAction<string>) => setView((previous) => {
    const date = typeof next === "function" ? next(previous.date) : next;
    if (!isDateKey(date)) return previous;
    return { ...previous, date, followsToday: date === todayKey() };
  }), []);
  const setQuery = useCallback((query: string) => setView((previous) => ({ ...previous, query })), []);
  return { date: view.date, query: view.query, setDate, setQuery, ready };
}
