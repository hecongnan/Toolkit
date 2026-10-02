"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { authErrorMessage, isMissingSessionError } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/client";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<"checking" | "ready" | "missing" | "error">("checking");
  const [retry, setRetry] = useState(0);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    setSessionStatus("checking");
    try {
      createClient().auth.getUser().then(({ data, error: userError }) => {
        if (!active) return;
        setSessionStatus(userError && !isMissingSessionError(userError) ? "error" : data.user ? "ready" : "missing");
      }).catch(() => {
        if (active) setSessionStatus("error");
      });
    } catch {
      setSessionStatus("error");
    }
    return () => { active = false; };
  }, [retry]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致。");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      await supabase.auth.signOut();
      router.replace("/login?password_reset=1");
    } catch (err: unknown) {
      setError(authErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <Card className="w-full max-w-md space-y-5">
        <div>
          <h1 className="text-xl font-semibold text-[color:var(--text-primary)]">设置新密码</h1>
          <p className="mt-2 text-sm text-[color:var(--text-secondary)]">设置成功后，请用新密码重新登录。</p>
        </div>
        {sessionStatus === "checking" && <p className="text-sm text-[color:var(--text-secondary)]">正在验证重置链接...</p>}
        {sessionStatus === "missing" && <p role="alert" className="text-sm text-rose-300">重置链接无效或已过期，请重新发送邮件。</p>}
        {sessionStatus === "error" && (
          <div className="space-y-2 text-sm text-rose-300">
            <p role="alert">暂时无法验证重置链接，请检查网络后重试。</p>
            <Button type="button" onClick={() => setRetry((value) => value + 1)}>重试验证</Button>
          </div>
        )}
        {sessionStatus === "ready" && <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm text-[color:var(--text-secondary)]">新密码
            <Input type="password" required minLength={6} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5" />
          </label>
          <label className="block text-sm text-[color:var(--text-secondary)]">确认新密码
            <Input type="password" required minLength={6} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1.5" />
          </label>
          {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
          <Button type="submit" variant="primary" disabled={saving} className="w-full">{saving ? "正在保存..." : "保存新密码"}</Button>
        </form>}
        <Link href="/forgot-password" className="block text-center text-sm text-teal-300 hover:text-teal-200">重发密码重置邮件</Link>
      </Card>
    </main>
  );
}
