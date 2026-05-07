import type { NextRequest } from "next/server";
import { fetchRepoBundle, parseRepoUrl } from "@/lib/github";
import { ANALYZER_SYSTEM_PROMPT, buildUserPrompt } from "@/lib/prompts";
import { createClient } from "@/lib/supabase/server";
import { getDeepSeekApiKey, sseEvent, streamDeepSeekChat } from "@/lib/deepseek";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AnalyzeBody {
  repoUrl?: string;
  branch?: string;
}

function extractSummary(markdown: string): string {
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    return line.replace(/^>\s*/, "").slice(0, 160);
  }
  return "";
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return Response.json({ error: "请先登录后再分析仓库" }, { status: 401 });
  }

  let body: AnalyzeBody;
  try {
    body = (await req.json()) as AnalyzeBody;
  } catch {
    return Response.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const repoUrl = body.repoUrl?.trim();
  if (!repoUrl) {
    return Response.json({ error: "请提供 repoUrl" }, { status: 400 });
  }

  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) {
    return Response.json(
      { error: "无法识别的仓库地址，请使用 https://github.com/owner/repo 形式" },
      { status: 400 },
    );
  }

  if (!getDeepSeekApiKey()) {
    return Response.json(
      { error: "服务端缺少 ANTHROPIC_AUTH_TOKEN，请在 .env.local 中配置" },
      { status: 500 },
    );
  }

  const branch = body.branch?.trim() || parsed.branch;
  const encoder = new TextEncoder();

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
        send("status", { stage: "fetching", message: "正在获取仓库信息..." });
        const bundle = await fetchRepoBundle(parsed.owner, parsed.repo, branch);
        send("meta", {
          owner: bundle.owner,
          repo: bundle.repo,
          branch: bundle.branch,
          stars: bundle.meta.stars,
          language: bundle.meta.language,
          description: bundle.meta.description,
          fileCount: bundle.tree.length,
          treeTruncated: bundle.treeTruncated,
          configFileCount: Object.keys(bundle.configFiles).length,
          sourceFileCount: Object.keys(bundle.sourceFiles).length,
        });

        send("status", { stage: "analyzing", message: "正在调用 DeepSeek 进行分析..." });

        const userPrompt = buildUserPrompt(bundle);
        let fullText = "";
        const { usage, stopReason } = await streamDeepSeekChat({
          model: process.env.DEEPSEEK_MODEL?.trim() || "deepseek-chat",
          maxTokens: 8192,
          messages: [
            { role: "system", content: ANALYZER_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          signal: abortSignal,
          onDelta(text) {
            fullText += text;
            send("delta", { text });
          },
        });

        const summary = extractSummary(fullText);
        const { data: savedReport, error: saveError } = await supabase
          .from("analysis_reports")
          .insert({
            user_id: user.id,
            repo_url: repoUrl,
            owner: bundle.owner,
            repo: bundle.repo,
            branch: bundle.branch,
            summary,
            markdown: fullText,
          })
          .select("id, repo_url, owner, repo, branch, summary, markdown, created_at")
          .single();

        if (saveError) {
          throw new Error(`报告保存失败：${saveError.message}`);
        }

        send("done", {
          markdown: fullText,
          usage,
          stopReason,
          report: savedReport,
        });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "未知错误";
        send("error", { message });
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
