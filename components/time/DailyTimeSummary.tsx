"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { durationLabel, timeDistribution, timerLabel } from "@/lib/time-tracking";
import { useTimeRecords } from "./useTimeRecords";
import { useTimeTracker } from "./TimeProvider";

export function DailyTimeSummary({ today }: { today: string }) {
  const data = useTimeRecords(today, today);
  const tracker = useTimeTracker();
  const summary = timeDistribution(data.records, data.range.from, data.range.to);
  return <Card role="region" aria-label="今日投入" className="mb-5 min-w-0 max-sm:!p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold">今日投入</h2>
        <p className="mt-2 text-xs leading-6 text-[color:var(--text-muted)]">按今天实际发生的时段计算，暂停不计入。</p>
      </div>
      <Link href="/time" className="quiet-link inline-flex min-h-11 items-center rounded-lg text-sm focus-ring">{tracker.active ? "管理当前计时 →" : "记录一段时间 →"}</Link>
    </div>
    <div className="mt-4 grid min-w-0 gap-5 sm:grid-cols-2">
      <div className="min-w-0">
        <p className="text-xs text-[color:var(--text-muted)]">今日已保存用时</p>
        <p aria-label="今日已保存用时" className="mt-2 break-words text-2xl font-semibold tabular-nums">{data.hasData ? durationLabel(summary.total) : data.loading ? "读取中…" : "暂不可用"}</p>
        {data.hasData && <p className="mt-2 break-words text-xs leading-6 text-[color:var(--text-muted)]">{summary.total ? summary.items.filter((item) => item.seconds > 0).map((item) => `${item.label} ${durationLabel(item.seconds)}`).join(" · ") : "今天还没有已保存的记录，也可以补记之前的活动。"}</p>}
        {data.loading && data.hasData && <p className="mt-2 text-xs text-[color:var(--text-muted)]">正在更新，暂显示上次结果。</p>}
        {data.error && <div role="alert" className="mt-3 text-xs leading-6"><p className="status-warning">{data.error}</p>{data.hasData && <p>显示上次结果，可能不是最新状态。</p>}<Button size="sm" variant="ghost" disabled={data.loading} onClick={() => void data.load()}>重试今日用时</Button></div>}
      </div>
      <div className="min-w-0 rounded-xl bg-[var(--control-bg)] p-4 max-sm:p-3">
        {tracker.active ? <>
          <p className="text-xs text-[color:var(--text-muted)]">{!tracker.ready ? "状态待同步" : tracker.active.running_since ? "正在计时" : "计时已暂停"}</p>
          <p className="mt-2 break-words text-sm font-medium">{tracker.active.title}</p>
          <p className="mt-2 break-all font-mono text-lg tabular-nums">{timerLabel(tracker.elapsed)}</p>
          <p className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">本次未保存用时，可能包含昨天；结束保存后再按日期计入统计。</p>
          <Button className="mt-3 max-w-full min-w-0" size="sm" disabled={tracker.busy || tracker.loading || !tracker.ready} onClick={() => void tracker.control(tracker.active!.running_since ? "pause" : "resume")}>{tracker.active.running_since ? "暂停计时" : "继续计时"}</Button>
        </> : <><p className="text-sm font-medium">{tracker.loading ? "正在读取计时状态…" : !tracker.ready ? "暂无法确认当前计时" : "现在没有进行中的计时"}</p><p className="mt-2 text-xs leading-6 text-[color:var(--text-muted)]">无需先建立任务，阅读、工作或生活活动都可以独立记录。</p></>}
        {tracker.error && <p role="alert" className="mt-2 break-words text-xs leading-6 status-warning">{tracker.error}</p>}
        {!tracker.ready && <Button className="mt-2 max-w-full min-w-0" size="sm" variant="ghost" disabled={tracker.loading || tracker.busy} onClick={() => void tracker.load()}>同步计时状态</Button>}
      </div>
    </div>
  </Card>;
}
