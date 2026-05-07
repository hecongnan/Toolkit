"use client";

import { Github, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";

interface Props {
  loading: boolean;
  onSubmit: (repoUrl: string, branch?: string) => void;
  onCancel?: () => void;
}

export function RepoForm({ loading, onSubmit, onCancel }: Props) {
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) return;
    onSubmit(repoUrl.trim(), branch.trim() || undefined);
  };

  return (
    <form onSubmit={submit} className="surface-strong p-5">
      <div className="mb-4 flex items-center gap-2 text-sm text-zinc-400">
        <Github size={16} className="text-fuchsia-300" />
        粘贴一个 GitHub 仓库地址，AI 将自动获取并生成分析报告
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <Input
          required
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          placeholder="https://github.com/vercel/next.js"
          autoFocus
          disabled={loading}
        />
        <Input
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          placeholder="分支（可选）"
          className="sm:w-40"
          disabled={loading}
        />
        {loading ? (
          <Button
            type="button"
            variant="danger"
            onClick={onCancel}
            className="sm:min-w-[110px]"
          >
            <X size={16} />
            停止
          </Button>
        ) : (
          <Button
            type="submit"
            variant="primary"
            disabled={!repoUrl.trim()}
            className="sm:min-w-[110px]"
          >
            <Sparkles size={16} />
            开始分析
          </Button>
        )}
      </div>
      {loading && (
        <div className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
          <Spinner size={14} />
          流式生成中，可随时停止...
        </div>
      )}
    </form>
  );
}
