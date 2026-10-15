import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";

export function RangeFeedback({ loading, hasData, error, onRetry, disabled = false }: {
  loading: boolean; hasData: boolean; error: string | null; onRetry: () => void; disabled?: boolean;
}) {
  return <>
    {loading && !hasData && <div className="flex items-center justify-center gap-2 py-12 text-sm text-[color:var(--text-muted)]"><Spinner size={18} />正在加载任务…</div>}
    {error && <div role="alert" className="mb-4 space-y-3 rounded-xl border border-[color:var(--border-default)] bg-[var(--surface)] p-4"><p className="break-words text-sm leading-6 status-error">{error}</p><p className="text-xs text-[color:var(--text-muted)]">{hasData ? "当前显示的是上次加载的结果，可能不是最新状态。" : "数据未加载完成，暂不显示统计。"}</p><Button size="sm" disabled={loading || disabled} onClick={onRetry}>重试加载</Button></div>}
    {loading && hasData && <p role="status" className="mb-3 text-xs text-[color:var(--text-muted)]">正在更新，现有任务仍可查看。</p>}
  </>;
}
