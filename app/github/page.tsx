"use client";

import { Github } from "lucide-react";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { FloatingAnalysisChat } from "@/components/github/FloatingAnalysisChat";
import { HistoryList } from "@/components/github/HistoryList";
import { RepoForm } from "@/components/github/RepoForm";
import { ReportView } from "@/components/github/ReportView";
import { createClient } from "@/lib/supabase/client";
import { toAnalysisReport, type AnalysisReportRow } from "@/lib/supabase/mappers";
import type { AnalysisReport } from "@/lib/types";

interface MetaPayload {
  owner: string;
  repo: string;
  branch: string;
  stars?: number;
  language?: string | null;
  description?: string | null;
  fileCount?: number;
  treeTruncated?: boolean;
  configFileCount?: number;
  sourceFileCount?: number;
}

export default function GitHubPage() {
  return (
    <Suspense fallback={null}>
      <GitHubPageInner />
    </Suspense>
  );
}

function GitHubPageInner() {
  const [reports, setReports] = useState<AnalysisReport[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [liveMarkdown, setLiveMarkdown] = useState("");
  const [meta, setMeta] = useState<MetaPayload | null>(null);
  const [status, setStatus] = useState<{ stage: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingRepoUrl, setPendingRepoUrl] = useState<string>("");
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [isAiOpen, setIsAiOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryId = searchParams.get("id");

  const loadReports = useCallback(async () => {
    setLoadingHistory(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: queryError } = await supabase
        .from("analysis_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (queryError) throw queryError;
      setReports(((data ?? []) as AnalysisReportRow[]).map(toAnalysisReport));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "加载历史报告失败");
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  useEffect(() => {
    if (loadingHistory || !queryId) return;
    const found = reports.find((r) => r.id === queryId);
    if (found) {
      setSelectedId(found.id);
      setLiveMarkdown("");
      setMeta(null);
      setStatus(null);
      setError(null);
    }
  }, [queryId, loadingHistory, reports]);

  const selected = useMemo(
    () => reports.find((r) => r.id === selectedId) ?? null,
    [reports, selectedId],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    setStatus(null);
  }, []);

  const analyze = useCallback(
    async (repoUrl: string, branch?: string) => {
      cancel();
      setSelectedId(null);
      setLiveMarkdown("");
      setMeta(null);
      setError(null);
      setStatus({ stage: "starting", message: "正在准备..." });
      setIsStreaming(true);
      setPendingRepoUrl(repoUrl);

      const controller = new AbortController();
      abortRef.current = controller;

      let collected = "";
      let metaData: MetaPayload | null = null;

      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repoUrl, branch }),
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
              setStatus(payload as { stage: string; message: string });
            } else if (event === "meta") {
              metaData = payload as MetaPayload;
              setMeta(metaData);
            } else if (event === "delta") {
              const { text } = payload as { text: string };
              collected += text;
              setLiveMarkdown(collected);
            } else if (event === "error") {
              const { message } = payload as { message: string };
              throw new Error(message);
            } else if (event === "done") {
              const { report } = payload as { report?: AnalysisReportRow };
              const saved = report ? toAnalysisReport(report) : null;
              if (saved) {
                setReports((prev) => [saved, ...prev.filter((r) => r.id !== saved.id)].slice(0, 50));
                setSelectedId(saved.id);
                router.replace(`/github?id=${saved.id}`, { scroll: false });
              } else {
                await loadReports();
              }
              setLiveMarkdown("");
              setStatus(null);
            }
          }
        }
      } catch (err: unknown) {
        if ((err as Error).name === "AbortError") {
          // user cancelled
        } else {
          const message = err instanceof Error ? err.message : "未知错误";
          setError(message);
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [cancel, loadReports, router],
  );

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const select = (r: AnalysisReport) => {
    setSelectedId(r.id);
    setLiveMarkdown("");
    setMeta(null);
    setStatus(null);
    setError(null);
    router.replace(`/github?id=${r.id}`, { scroll: false });
  };

  const removeReport = async (id: string) => {
    setError(null);
    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from("analysis_reports")
        .delete()
        .eq("id", id);
      if (deleteError) throw deleteError;
      setReports((prev) => prev.filter((r) => r.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        router.replace("/github", { scroll: false });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "删除历史报告失败");
    }
  };

  const displayMeta: MetaPayload | null = useMemo(() => {
    if (meta) return meta;
    if (selected) {
      return {
        owner: selected.owner,
        repo: selected.repo,
        branch: selected.branch,
        description: null,
      };
    }
    return null;
  }, [meta, selected]);

  return (
    <>
      <PageHeader
        eyebrow="GitHub"
        title="仓库智能分析"
        description="粘贴一个 GitHub 仓库地址，自动获取关键文件并由 DeepSeek 生成通俗易懂的分析报告。"
      />

      <div className="space-y-6">
        <RepoForm
          loading={isStreaming}
          onSubmit={analyze}
          onCancel={cancel}
        />

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0 space-y-4">
            {error && (
              <ReportView
                report={null}
                liveMarkdown=""
                meta={null}
                status={null}
                error={error}
                isStreaming={false}
              />
            )}
            {!error && (isStreaming || liveMarkdown || selected) ? (
              <>
                <ReportView
                  report={selected}
                  liveMarkdown={liveMarkdown}
                  meta={displayMeta}
                  status={status}
                  error={null}
                  isStreaming={isStreaming}
                  onAskAi={() => setIsAiOpen(true)}
                />
              </>
            ) : !error && !isStreaming ? (
              <div className="surface px-6 py-12 text-center text-sm text-zinc-400">
                <Github
                  size={28}
                  className="mx-auto mb-3 text-fuchsia-300/80"
                  strokeWidth={1.6}
                />
                <p className="font-medium text-zinc-200">尚未选择报告</p>
                <p className="mt-1 text-zinc-500">
                  在上方输入仓库地址生成新分析，或从右侧历史中查看。
                </p>
                {pendingRepoUrl && (
                  <p className="mt-4 text-[11px] text-zinc-600">最近请求：{pendingRepoUrl}</p>
                )}
              </div>
            ) : null}
          </div>

          <div className="lg:sticky lg:top-6 lg:h-fit">
            {loadingHistory ? (
              <div className="surface flex justify-center py-10">
                <span className="text-sm text-zinc-500">正在加载历史...</span>
              </div>
            ) : (
              <HistoryList
                reports={reports}
                selectedId={selectedId}
                onSelect={select}
                onDelete={removeReport}
              />
            )}
          </div>
        </div>
      </div>

      <FloatingAnalysisChat
        report={selected}
        open={isAiOpen}
        onOpenChange={setIsAiOpen}
        disabled={isStreaming}
      />
    </>
  );
}
