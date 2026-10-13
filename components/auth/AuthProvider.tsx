"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { isMissingSessionError } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/client";

type AuthState = { status: "checking" | "ready" | "error"; user: User | null; warning: boolean };
const AuthContext = createContext<(AuthState & { retry: () => Promise<void> }) | null>(null);
const initialState: AuthState = { status: "checking", user: null, warning: false };

function invalidSession(error: unknown): boolean {
  if (isMissingSessionError(error)) return true;
  const value = error as { status?: number; code?: string } | null;
  return value?.status === 401 || value?.status === 403 ||
    ["bad_jwt", "user_not_found", "user_banned", "refresh_token_not_found", "refresh_token_already_used"].includes(value?.code ?? "");
}

// The verified user lives only in this mounted workspace, not in a second
// persistent auth cache. API routes and Supabase RLS still authorize every write.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState);
  const verifyRef = useRef<() => Promise<void>>(async () => {});
  const retry = useCallback(() => verifyRef.current(), []);

  useEffect(() => {
    let active = true;
    let current = initialState;
    let request = 0;
    let checking = false;
    let lastCheck = 0;
    let expectedUserId: string | undefined;
    let scheduled: ReturnType<typeof setTimeout> | undefined;
    const publish = (next: AuthState) => { if (active) { current = next; setState(next); } };
    try {
      const client = createClient();
      const verify = async () => {
        if (!active || checking) return;
        checking = true;
        lastCheck = Date.now();
        const version = ++request;
        if (!current.user) publish({ status: "checking", user: null, warning: false });
        try {
          const { data: { user }, error } = await client.auth.getUser();
          if (!active || version !== request) return;
          if (error && !invalidSession(error)) throw error;
          if (!error && expectedUserId && user?.id !== expectedUserId) {
            // A sign-in may have changed the session while this read was in
            // flight. Never publish its old identity; check the new session.
            expectedUserId = undefined;
            checking = false;
            clearTimeout(scheduled);
            scheduled = setTimeout(() => { void verify(); }, 0);
            return;
          }
          expectedUserId = undefined;
          publish({ status: "ready", user: error ? null : user, warning: false });
        } catch {
          if (active && version === request) publish(current.user
            ? { ...current, warning: true }
            : { status: "error", user: null, warning: false });
        } finally { if (version === request) checking = false; }
      };
      verifyRef.current = verify;
      // Do not await Supabase methods inside its auth callback: callbacks run
      // under the client's auth lock. Defer verification until that lock exits.
      const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
        if (!active || event === "INITIAL_SESSION") return;
        if (event === "SIGNED_OUT") {
          request += 1;
          checking = false;
          expectedUserId = undefined;
          clearTimeout(scheduled);
          publish({ status: "ready", user: null, warning: false });
        } else if (session?.user) {
          if (current.user?.id === session.user.id) {
            if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") publish({ ...current, user: session.user });
            return;
          }
          expectedUserId = session.user.id;
          // Startup recovery emits SIGNED_IN as getUser waits for the client's
          // initialization. Reuse that pending check, not a second request.
          if (checking && current.status === "checking") return;
          request += 1;
          checking = false;
          publish(initialState);
          clearTimeout(scheduled);
          scheduled = setTimeout(() => { void verify(); }, 0);
        }
      });
      const resume = () => { if (document.visibilityState === "visible" && Date.now() - lastCheck >= 60_000) void verify(); };
      const online = () => { void verify(); };
      window.addEventListener("focus", resume);
      document.addEventListener("visibilitychange", resume);
      window.addEventListener("online", online);
      void verify();
      return () => {
        active = false;
        request += 1;
        clearTimeout(scheduled);
        subscription.unsubscribe();
        window.removeEventListener("focus", resume);
        document.removeEventListener("visibilitychange", resume);
        window.removeEventListener("online", online);
        verifyRef.current = async () => {};
      };
    } catch {
      publish({ status: "error", user: null, warning: false });
      // Retrying recreates the client if configuration was not ready initially.
      verifyRef.current = async () => { window.location.reload(); };
      return () => { active = false; };
    }
  }, []);

  return <AuthContext.Provider value={{ ...state, retry }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
