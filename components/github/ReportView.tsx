"use client";

import { Copy, Download, ExternalLink } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import type { AnalysisReport } from "@/lib/types";

interface MetaInfo {
  stars?: number;
  language?: string | null;
  fileCount?: number;
  configFileCount?: number;
  sourceFileCount?: number;
  description?: string | null;
  treeTruncated?: boolean;
}

interface Props {
  report: AnalysisReport | null;
  liveMarkdown: string;
  meta: MetaInfo | null;
  status: { stage: string; message: string } | null;
  error: string | null;
  isStreaming: boolean;
}

export function ReportView({
  report,
  liveMarkdown,
  meta,
  status,
  error,
  isStreaming,
}: Props) {
  const markdown = isStreaming || !report ? liveMarkdown : report.markdown;
  const repoUrl = report?.repoUrl;

  const copy = async () => {
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
    } catch {
      // ignore
    }
  };

  const download = () => {
    if (!markdown) return;
    const slug = report ? `${report.owner}-${report.repo}` : "report";
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}-analysis.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (error) {
    return (
      <Card className="border-rose-500/30 bg-rose-500/5">
        <p className="text-sm font-semibold text-rose-200">分析失败</p>
        <p className="mt-1 text-sm text-rose-100/80">{error}</p>
      </Card>
    );
  }

  if (!markdown && !status) {
    return null;
  }

  return (
    <Card className="!p-0 overflow-hidden">
      {(meta || status || repoUrl) && (
        <div className="flex flex-col gap-3 border-b border-white/5 bg-white/[0.02] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {meta?.language && <Tag tone="violet">{meta.language}</Tag>}
            {typeof meta?.stars === "number" && (
              <Tag tone="amber">★ {meta.stars.toLocaleString()}</Tag>
            )}
            {typeof meta?.fileCount === "number" && (
              <Tag>{meta.fileCount} files{meta.treeTruncated ? "+" : ""}</Tag>
            )}
            {typeof meta?.sourceFileCount === "number" && (
              <Tag tone="sky">已读取 {meta.sourceFileCount} 个源文件</Tag>
            )}
            {status && isStreaming && (
              <span className="inline-flex items-center gap-2 text-xs text-zinc-400">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fuchsia-400/60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-fuchsia-400" />
                </span>
                {status.message}
              </span>
            )}
          </div>
          {markdown && (
            <div className="flex flex-wrap gap-2">
              {repoUrl && (
                <a
                  href={repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs text-zinc-300 hover:bg-white/[0.08] focus-ring"
                >
                  <ExternalLink size={13} />
                  打开仓库
                </a>
              )}
              <Button size="sm" variant="ghost" onClick={copy}>
                <Copy size={13} />
                复制
              </Button>
              <Button size="sm" variant="secondary" onClick={download}>
                <Download size={13} />
                下载
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="px-5 py-6 sm:px-7 sm:py-8">
        {markdown ? (
          <article className="report-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
            {isStreaming && (
              <span className="ml-1 inline-block h-4 w-1.5 -mb-0.5 animate-pulse bg-fuchsia-400/80 align-middle" />
            )}
          </article>
        ) : (
          <p className="text-sm text-zinc-400">{status?.message ?? "准备开始..."}</p>
        )}
      </div>
    </Card>
  );
}
