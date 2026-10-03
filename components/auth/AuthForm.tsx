"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/auth-errors";

interface AuthFormProps {
  mode: "login" | "register";
}

export function AuthForm({ mode }: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const router = useRouter();

  const isLogin = mode === "login";

  useEffect(() => {
    setPasswordVisible(false);
    if (isLogin && new URLSearchParams(window.location.search).get("password_reset") === "1") {
      setMessage("密码已更新，请使用新密码登录。");
    }
  }, [isLogin]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setNeedsVerification(false);
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
        setNeedsVerification(true);
        setVerificationEmail(credentials.email);
        return;
      }

      const next = new URLSearchParams(window.location.search).get("next");
      const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
      router.replace(safeNext);
      router.refresh();
    } catch (err: unknown) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const resendVerification = async () => {
    if (!verificationEmail || resending) return;
    setResending(true);
    setError(null);
    try {
      const { error: resendError } = await createClient().auth.resend({
        type: "signup",
        email: verificationEmail,
      });
      if (resendError) throw resendError;
      setMessage("验证邮件已发送。请检查收件箱和垃圾邮件文件夹。");
    } catch (err: unknown) {
      setError(authErrorMessage(err));
    } finally {
      setResending(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center px-5 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="brand-mark mb-6 h-14 w-14">
            <Sparkles size={22} strokeWidth={2.4} />
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.035em] text-[color:var(--text-primary)]">
            {isLogin ? "欢迎回到 Toolkit" : "开启你的个人工作区"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-[color:var(--text-muted)]">
            {isLogin ? "学习、计划、探索。从这里继续。" : "把资料、待办和项目灵感，放在一个地方。"}
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

            <div>
              <label htmlFor="auth-password" className="mb-1.5 block text-xs font-medium text-[color:var(--text-muted)]">密码</label>
              <div className="relative">
                <Input
                  id="auth-password"
                  type={passwordVisible ? "text" : "password"}
                  required
                  minLength={isLogin ? undefined : 6}
                  aria-describedby={isLogin ? undefined : "password-help"}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  autoCapitalize="none"
                  spellCheck={false}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isLogin ? "输入密码" : "设置密码"}
                  className="pr-14"
                />
                <button type="button" aria-label={passwordVisible ? "隐藏密码" : "显示密码"} aria-controls="auth-password" aria-pressed={passwordVisible}
                  onPointerDown={(event) => event.preventDefault()} onClick={() => setPasswordVisible((visible) => !visible)}
                  className="button icon-button absolute right-1 top-0 focus-ring">
                  {passwordVisible ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
                </button>
              </div>
              {!isLogin && <p id="password-help" className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">至少 6 位。请使用不易被猜到的密码。</p>}
            </div>

            {error && (
              <div role="alert" className="status-error rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-3 text-sm">
                {error}
              </div>
            )}
            {message && (
              <div role="status" className="status-success rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-sm">
                {message}
                {needsVerification && (
                  <button type="button" onClick={resendVerification} disabled={resending} className="mt-2 block font-medium underline disabled:opacity-50">
                    {resending ? "正在发送..." : "没有收到？重新发送验证邮件"}
                  </button>
                )}
              </div>
            )}

            <Button type="submit" variant="primary" className="w-full" disabled={loading}>
              {loading && <Spinner size={14} className="text-white" />}
              {isLogin ? "登录" : "注册"}
            </Button>
          </form>

          {isLogin && (
            <p className="mt-4 text-right text-sm">
              <Link href="/forgot-password" className="font-medium text-teal-300 hover:text-teal-200">
                忘记密码？
              </Link>
            </p>
          )}

          <p className="mt-5 text-center text-sm text-zinc-500">
            {isLogin ? "还没有账号？" : "已有账号？"}
            <Link
              href={isLogin ? "/register" : "/login"}
              className="ml-1 font-medium text-teal-300 hover:text-teal-200"
            >
              {isLogin ? "去注册" : "去登录"}
            </Link>
          </p>
        </Card>
      </div>
    </main>
  );
}
