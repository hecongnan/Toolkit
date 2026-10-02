import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    try {
      const { error } = await createClient().auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(new URL("/update-password", request.url));
      }
    } catch {
      // Missing configuration or expired recovery link.
    }
  }
  return NextResponse.redirect(new URL("/forgot-password?error=link", request.url));
}
