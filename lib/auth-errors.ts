export function authErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "操作失败，请稍后再试";
  if (/invalid login credentials/i.test(message)) return "邮箱或密码不正确，请检查后重试。";
  if (/email not confirmed/i.test(message)) return "邮箱尚未验证，请先查看验证邮件。";
  if (/user already registered/i.test(message)) return "这个邮箱已经注册，请直接登录。";
  if (/password should be at least/i.test(message)) return "密码长度不足，请设置至少 6 位。";
  if (/new password should be different|same_password/i.test(message)) return "新密码不能与旧密码相同。";
  if (/otp.*expired|token.*expired|invalid.*token/i.test(message)) return "链接无效或已过期，请重新发送邮件。";
  if (/email rate limit exceeded|over_email_send_rate_limit|too many requests/i.test(message)) {
    return "邮件发送过于频繁，请稍后再试。";
  }
  if (/network|fetch failed|failed to fetch/i.test(message)) return "网络连接失败，请检查网络后重试。";
  return "操作未完成，请稍后重试。如持续失败，请检查网络连接。";
}

export function isMissingSessionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const authError = error as { name?: string; code?: string; message?: string };
  return authError.name === "AuthSessionMissingError" ||
    authError.code === "session_not_found" ||
    /auth session missing/i.test(authError.message ?? "");
}
