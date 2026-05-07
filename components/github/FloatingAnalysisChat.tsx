"use client";

import { Bot, Sparkles } from "lucide-react";
import { AnalysisChat } from "@/components/github/AnalysisChat";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import type { AnalysisReport } from "@/lib/types";

interface FloatingAnalysisChatProps {
  report: AnalysisReport | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
}

export function FloatingAnalysisChat({
  report,
  open,
  onOpenChange,
  disabled = false,
}: FloatingAnalysisChatProps) {
  const title = report ? `AI 追问 · ${report.owner}/${report.repo}` : "AI 追问";

  return (
    <>
      <button
        type="button"
        onClick={() => !disabled && onOpenChange(true)}
        disabled={disabled}
        className={cn(
          "fixed bottom-5 right-5 z-30 grid h-14 w-14 place-items-center rounded-2xl bg-brand-gradient text-white shadow-glow transition focus-ring sm:bottom-8 sm:right-8",
          disabled
            ? "cursor-not-allowed opacity-50"
            : "hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 active:brightness-95",
        )}
        aria-label={disabled ? "报告生成完成后可追问 AI" : "打开 AI 追问"}
        title={disabled ? "报告生成完成后可追问 AI" : "打开 AI 追问"}
      >
        {report ? <Bot size={22} /> : <Sparkles size={22} />}
      </button>

      <Modal
        open={open}
        onClose={() => onOpenChange(false)}
        title={title}
        keepMounted
        className="sm:max-w-2xl"
      >
        <AnalysisChat report={report} variant="panel" />
      </Modal>
    </>
  );
}
