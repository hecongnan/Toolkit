"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { authErrorMessage } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "link") {
      setError("重置链接无效或已过期，请重新发送邮件。");
    }
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error: resetError } = await createClient().auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (resetError) throw resetError;
      setSent(true);
    } catch (err: unknown) {
      setError(authErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <Card className="w-full max-w-md space-y-5">
        <div>
          <h1 className="text-xl font-semibold text-[color:var(--text-primary)]">找回密码</h1>
          <p className="mt-2 text-sm text-[color:var(--text-secondary)]">输入注册邮箱，我们会发送密码重置链接。</p>
        </div>
        {sent ? (
          <div className="space-y-3">
            <p role="status" className="text-sm text-emerald-300">如果该邮箱已注册，请检查收件箱和垃圾邮件文件夹。链接可能需要几分钟才能送达。</p>
            <Button type="button" onClick={() => setSent(false)}>修改邮箱或重新发送</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block text-sm text-[color:var(--text-secondary)]">
              邮箱
              <Input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5" />
            </label>
            {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
            <Button type="submit" variant="primary" disabled={sending} className="w-full">{sending ? "正在发送..." : "发送重置邮件"}</Button>
          </form>
        )}
        <Link href="/login" className="block text-center text-sm text-teal-300 hover:text-teal-200">返回登录</Link>
      </Card>
    </main>
  );
}
