import type { NextRequest } from "next/server";
import { sseEvent, streamDeepSeekChat, type DeepSeekMessage } from "@/lib/deepseek";
import {
  ANALYSIS_CHAT_SYSTEM_PROMPT,
  buildAnalysisChatPrompt,
} from "@/lib/prompts";
import { createClient } from "@/lib/supabase/server";
import type {
  AnalysisChatRow,
  AnalysisReportRow,
} from "@/lib/supabase/mappers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatBody {
  reportId?: string;
  message?: string;
}

const MESSAGE_LIMIT = 2000;
const HISTORY_LIMIT = 20;

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return Response.json({ error: "请先登录后再提问" }, { status: 401 });
  }

  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return Response.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const reportId = body.reportId?.trim();
  const message = body.message?.trim();

  if (!reportId) {
    return Response.json({ error: "请选择一份分析报告" }, { status: 400 });
  }
  if (!message) {
    return Response.json({ error: "请输入要追问的问题" }, { status: 400 });
  }
  if (message.length > MESSAGE_LIMIT) {
    return Response.json(
      { error: `问题过长，请控制在 ${MESSAGE_LIMIT} 字以内` },
      { status: 400 },
    );
  }

  const { data: report, error: reportError } = await supabase
    .from("analysis_reports")
    .select("id, repo_url, owner, repo, branch, summary, markdown, created_at")
    .eq("id", reportId)
    .eq("user_id", user.id)
    .single();

  if (reportError || !report) {
    return Response.json({ error: "没有找到这份报告" }, { status: 404 });
  }

  const { data: history, error: historyError } = await supabase
    .from("analysis_chats")
    .select("id, report_id, role, content, created_at")
    .eq("report_id", reportId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  if (historyError) {
    return Response.json({ error: historyError.message }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const reportRow = report as AnalysisReportRow;
  const historyRows = ((history ?? []) as AnalysisChatRow[]).reverse();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseEvent(event, data)));
      };

      const abortSignal = req.signal;
      const onAbort = () => {
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      abortSignal.addEventListener("abort", onAbort);

      try {
        send("status", { stage: "saving", message: "正在保存你的问题..." });
        const { data: userMessage, error: userInsertError } = await supabase
          .from("analysis_chats")
          .insert({
            user_id: user.id,
            report_id: reportId,
            role: "user",
            content: message,
          })
          .select("id, report_id, role, content, created_at")
          .single();

        if (userInsertError) {
          throw new Error(`问题保存失败：${userInsertError.message}`);
        }

        send("user_message", { message: userMessage });
        send("status", { stage: "thinking", message: "DeepSeek 正在基于报告回答..." });

        const messages: DeepSeekMessage[] = [
          { role: "system", content: ANALYSIS_CHAT_SYSTEM_PROMPT },
          ...historyRows.map((item) => ({
            role: item.role,
            content: item.content,
          })),
          {
            role: "user",
            content: buildAnalysisChatPrompt(
              {
                repoUrl: reportRow.repo_url,
                owner: reportRow.owner,
                repo: reportRow.repo,
                branch: reportRow.branch,
                summary: reportRow.summary,
                markdown: reportRow.markdown,
              },
              message,
            ),
          },
        ];

        let answer = "";
        const { usage, stopReason } = await streamDeepSeekChat({
          model:
            process.env.DEEPSEEK_CHAT_MODEL?.trim() ||
            process.env.DEEPSEEK_MODEL?.trim() ||
            "deepseek-chat",
          maxTokens: 4096,
          messages,
          signal: abortSignal,
          onDelta(text) {
            answer += text;
            send("delta", { text });
          },
        });

        const { data: assistantMessage, error: assistantInsertError } = await supabase
          .from("analysis_chats")
          .insert({
            user_id: user.id,
            report_id: reportId,
            role: "assistant",
            content: answer,
          })
          .select("id, report_id, role, content, created_at")
          .single();

        if (assistantInsertError) {
          throw new Error(`回答保存失败：${assistantInsertError.message}`);
        }

        send("done", {
          message: assistantMessage,
          usage,
          stopReason,
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "未知错误";
        send("error", { message: errorMessage });
      } finally {
        abortSignal.removeEventListener("abort", onAbort);
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
