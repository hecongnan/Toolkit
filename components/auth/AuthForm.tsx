"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { createClient } from "@/lib/supabase/client";

interface AuthFormProps {
  mode: "login" | "register";
}

export function AuthForm({ mode }: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  const isLogin = mode === "login";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const credentials = { email: email.trim(), password };
      const { data, error: authError } = isLogin
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);

      if (authError) throw authError;

      if (!isLogin && !data.session) {
        setMessage("注册成功，请先到邮箱完成验证后再登录。");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "操作失败，请稍后再试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-gradient text-white shadow-glow">
            <Sparkles size={22} strokeWidth={2.4} />
          </div>
          <h1 className="text-2xl font-semibold text-zinc-50">
            {isLogin ? "登录 Toolkit" : "注册 Toolkit"}
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            {isLogin ? "登录后即可同步你的资料、Todo 和分析报告。" : "创建账号后，你的数据会按用户独立保存。"}
          </p>
        </div>

        <Card>
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-zinc-400">邮箱</span>
              <Input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-zinc-400">密码</span>
              <Input
                type="password"
                required
                minLength={6}
                autoComplete={isLogin ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 6 位"
              />
            </label>

            {error && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                {error}
              </div>
            )}
            {message && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                {message}
              </div>
            )}

            <Button type="submit" variant="primary" className="w-full" disabled={loading}>
              {loading && <Spinner size={14} className="text-white" />}
              {isLogin ? "登录" : "注册"}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-zinc-500">
            {isLogin ? "还没有账号？" : "已有账号？"}
            <Link
              href={isLogin ? "/register" : "/login"}
              className="ml-1 font-medium text-fuchsia-300 hover:text-fuchsia-200"
            >
              {isLogin ? "去注册" : "去登录"}
            </Link>
          </p>
        </Card>
      </div>
    </main>
  );
}
