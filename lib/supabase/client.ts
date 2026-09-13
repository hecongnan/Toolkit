import { createBrowserClient } from "@supabase/ssr";

interface ToolkitRuntimeConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

declare global {
  interface Window {
    __TOOLKIT_CONFIG__?: ToolkitRuntimeConfig;
  }
}

export function createClient() {
  const runtimeConfig =
    typeof window === "undefined" ? undefined : window.__TOOLKIT_CONFIG__;
  const url = runtimeConfig?.supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    runtimeConfig?.supabaseAnonKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("缺少 Supabase 环境变量，请配置 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return createBrowserClient(url, anonKey);
}
