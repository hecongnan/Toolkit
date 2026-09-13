"use client";

import { Eye, EyeOff, KeyRound, RotateCcw, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import {
  clearAiSettings,
  DEFAULT_AI_SETTINGS,
  readAiSettings,
  writeAiSettings,
} from "@/lib/ai-settings";

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState("");
  const [analysisModel, setAnalysisModel] = useState(DEFAULT_AI_SETTINGS.analysisModel);
  const [chatModel, setChatModel] = useState(DEFAULT_AI_SETTINGS.chatModel);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const settings = readAiSettings();
    setApiKey(settings.apiKey);
    setAnalysisModel(settings.analysisModel);
    setChatModel(settings.chatModel);
  }, []);

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    writeAiSettings({
      apiKey: apiKey.trim(),
      analysisModel: analysisModel.trim() || DEFAULT_AI_SETTINGS.analysisModel,
      chatModel: chatModel.trim() || DEFAULT_AI_SETTINGS.chatModel,
    });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  };

  const reset = () => {
    clearAiSettings();
    setApiKey("");
    setAnalysisModel(DEFAULT_AI_SETTINGS.analysisModel);
    setChatModel(DEFAULT_AI_SETTINGS.chatModel);
    setSaved(false);
  };

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="AI 设置"
        description="配置你自己的 DeepSeek API Key 和模型。配置只保存在当前浏览器。"
      />

      <div className="max-w-2xl">
        <Card className="!p-0 overflow-hidden">
          <div className="flex items-center gap-3 border-b border-[color:var(--border-subtle)] px-5 py-4">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-teal-500/10 text-teal-300">
              <KeyRound size={17} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[color:var(--text-primary)]">DeepSeek</p>
              <p className="text-xs text-[color:var(--text-muted)]">留空 API Key 时使用服务端默认配置</p>
            </div>
          </div>

          <form onSubmit={save} className="space-y-5 p-5">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-[color:var(--text-secondary)]">
                API Key
              </span>
              <div className="relative">
                <Input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="sk-..."
                  autoComplete="off"
                  className="pr-11 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((current) => !current)}
                  aria-label={showKey ? "隐藏 API Key" : "显示 API Key"}
                  title={showKey ? "隐藏 API Key" : "显示 API Key"}
                  className="absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-md text-[color:var(--text-muted)] hover:bg-[var(--control-hover)] hover:text-[color:var(--text-primary)] focus-ring"
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-[color:var(--text-secondary)]">
                  仓库分析模型
                </span>
                <Input
                  value={analysisModel}
                  onChange={(event) => setAnalysisModel(event.target.value)}
                  placeholder="deepseek-chat"
                  maxLength={100}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-[color:var(--text-secondary)]">
                  报告追问模型
                </span>
                <Input
                  value={chatModel}
                  onChange={(event) => setChatModel(event.target.value)}
                  placeholder="deepseek-chat"
                  maxLength={100}
                />
              </label>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-[color:var(--border-subtle)] pt-5 sm:flex-row sm:items-center sm:justify-between">
              <Button type="button" variant="ghost" onClick={reset}>
                <RotateCcw size={15} />
                恢复默认
              </Button>
              <div className="flex items-center justify-end gap-3">
                {saved && <span className="text-xs text-emerald-300">已保存</span>}
                <Button type="submit" variant="primary">
                  <Save size={15} />
                  保存配置
                </Button>
              </div>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
