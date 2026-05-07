"use client";

import { Bot, Send, User } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";
import {
  toAnalysisChatMessage,
  type AnalysisChatRow,
} from "@/lib/supabase/mappers";
import type { AnalysisChatMessage, AnalysisReport } from "@/lib/types";

interface Props {
  report: AnalysisReport | null;
  variant?: "card" | "panel";
}

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AnalysisChat({ report, variant = "card" }: Props) {
  const [messages, setMessages] = useState<AnalysisChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reportId = report?.id ?? null;

  const loadMessages = useCallback(async () => {
    if (!reportId) {
      setMessages([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: queryError } = await supabase
        .from("analysis_chats")
        .select("id, report_id, role, content, created_at")
        .eq("report_id", reportId)
        .order("created_at", { ascending: true });
      if (queryError) throw queryError;
      setMessages(((data ?? []) as AnalysisChatRow[]).map(toAnalysisChatMessage));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "加载对话历史失败");
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    abortRef.current?.abort();
    setDraft("");
    setStatus(null);
    setError(null);
    setSending(false);
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const canSend = useMemo(
    () => Boolean(reportId && draft.trim() && !sending),
    [draft, reportId, sending],
  );
  const isPanel = variant === "panel";
  const Container = isPanel ? "div" : Card;

  const send = async () => {
    const content = draft.trim();
    if (!reportId || !content || sending) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setDraft("");
    setSending(true);
    setError(null);
    setStatus("正在提交问题...");

    const optimisticUser: AnalysisChatMessage = {
      id: `local-user-${Date.now()}`,
      reportId,
      role: "user",
      content,
      createdAt: Date.now(),
    };
    const optimisticAssistant: AnalysisChatMessage = {
      id: `local-assistant-${Date.now()}`,
      reportId,
      role: "assistant",
      content: "",
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, optimisticUser, optimisticAssistant]);

    try {
      const res = await fetch("/api/analyze/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, message: content }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        let detail = "请求失败";
        try {
          const data = await res.json();
          if (data?.error) detail = data.error;
        } catch {
          // ignore
        }
        throw new Error(detail);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          if (!chunk.trim()) continue;

          let event = "message";
          const dataLines: string[] = [];
          for (const line of chunk.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
          }
          if (dataLines.length === 0) continue;

          let payload: unknown;
          try {
            payload = JSON.parse(dataLines.join("\n"));
          } catch {
            continue;
          }

          if (event === "status") {
            const { message } = payload as { message?: string };
            setStatus(message ?? null);
          } else if (event === "user_message") {
            const { message } = payload as { message?: AnalysisChatRow };
            if (message) {
              const savedUser = toAnalysisChatMessage(message);
              setMessages((prev) =>
                prev.map((item) =>
                  item.id === optimisticUser.id ? savedUser : item,
                ),
              );
            }
          } else if (event === "delta") {
            const { text } = payload as { text: string };
            assistantText += text;
            setMessages((prev) =>
              prev.map((item) =>
                item.id === optimisticAssistant.id
                  ? { ...item, content: assistantText }
                  : item,
              ),
            );
          } else if (event === "done") {
            const { message } = payload as { message?: AnalysisChatRow };
            if (message) {
              const savedAssistant = toAnalysisChatMessage(message);
              setMessages((prev) =>
                prev.map((item) =>
                  item.id === optimisticAssistant.id ? savedAssistant : item,
                ),
              );
            }
            setStatus(null);
          } else if (event === "error") {
            const { message } = payload as { message: string };
            throw new Error(message);
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError") {
        const message = err instanceof Error ? err.message : "发送失败";
        setError(message);
        setMessages((prev) =>
          prev.filter(
            (item) =>
              item.id !== optimisticUser.id && item.id !== optimisticAssistant.id,
          ),
        );
        setDraft(content);
      }
    } finally {
      setSending(false);
      setStatus(null);
      abortRef.current = null;
    }
  };

  if (!report) {
    return (
      <div
        className={cn(
          "overflow-hidden",
          isPanel ? "" : "surface p-5",
        )}
      >
        <div className="rounded-2xl border border-dashed border-[color:var(--border-default)] bg-[var(--control-bg)] px-4 py-8 text-center">
          <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-fuchsia-500/15 text-fuchsia-300">
            <Bot size={18} />
          </div>
          <p className="text-sm font-semibold text-[color:var(--text-primary)]">先选择一份报告</p>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[color:var(--text-tertiary)]">
            生成或从右侧历史中选择 GitHub 分析报告后，就可以在这里基于报告继续追问。
          </p>
        </div>
      </div>
    );
  }

  return (
    <Container className={cn("!p-0 overflow-hidden", isPanel && "bg-transparent")}>
      <div className="border-b border-[color:var(--border-subtle)] bg-[var(--surface-header)] px-5 py-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[color:var(--text-primary)]">AI 追问</p>
            <p className="text-xs text-[color:var(--text-muted)]">
              基于当前报告继续提问，DeepSeek 会结合报告上下文回答。
            </p>
          </div>
          {(loading || sending || status) && (
            <span className="mt-2 inline-flex items-center gap-2 text-xs text-[color:var(--text-tertiary)] sm:mt-0">
              <Spinner size={13} />
              {status ?? (loading ? "正在加载历史..." : "正在生成回答...")}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-4 px-5 py-5">
        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            {error}
          </div>
        )}

        <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
          {!loading && messages.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[color:var(--border-default)] bg-[var(--control-bg)] px-4 py-6 text-center text-sm text-[color:var(--text-muted)]">
              还没有追问。可以问：“这个项目的入口文件在哪里？”或“我应该先读哪些模块？”
            </div>
          )}

          {messages.map((message) => {
            const isUser = message.role === "user";
            return (
              <div
                key={message.id}
                className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}
              >
                {!isUser && (
                  <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fuchsia-500/15 text-fuchsia-200">
                    <Bot size={15} />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-6",
                    isUser
                      ? "bg-fuchsia-500/20 text-zinc-50"
                      : "border border-[color:var(--border-default)] bg-[var(--control-bg)] text-[color:var(--text-secondary)]",
                  )}
                >
                  <p className="whitespace-pre-wrap">{message.content || "..."}</p>
                  <p className="mt-2 text-[10px] text-[color:var(--text-faint)]">{timeLabel(message.createdAt)}</p>
                </div>
                {isUser && (
                  <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sky-500/15 text-sky-200">
                    <User size={15} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-3 border-t border-[color:var(--border-subtle)] pt-4">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="继续追问这份报告，例如：我想二次开发应该先改哪里？"
            disabled={sending}
            maxLength={2000}
            className="min-h-[96px]"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-[color:var(--text-faint)]">
              {draft.length}/2000 · Ctrl/⌘ + Enter 发送
            </p>
            <Button onClick={send} disabled={!canSend} variant="primary" className="sm:min-w-[110px]">
              {sending ? <Spinner size={14} className="text-white" /> : <Send size={14} />}
              发送
            </Button>
          </div>
        </div>
      </div>
    </Container>
  );
}
