const PUBLIC_ENV_NAMES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

type PublicEnvName = (typeof PUBLIC_ENV_NAMES)[number];

export function readRuntimeEnv(name: PublicEnvName): string | undefined {
  return process.env[name];
}
