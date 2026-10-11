"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { MATERIAL_STATUS_LABEL, safeMaterialUrl } from "@/lib/materials";
import type { Material, MaterialStatus } from "@/lib/types";
import type { MaterialDraft } from "./useMaterialDraft";

interface Props {
  initial?: Material | null;
  draft: MaterialDraft;
  onChange: <K extends keyof MaterialDraft>(field: K, value: MaterialDraft[K]) => void;
  categories: string[];
  onSubmit: (m: Material) => void;
  onCancel: () => void;
  saving?: boolean;
  error?: string | null;
}

const STATUS_OPTIONS: Array<{ value: MaterialStatus; label: string }> = [
  { value: "todo", label: "待学" },
  { value: "doing", label: "进行中" },
  { value: "done", label: "已完成" },
];

export function MaterialForm({ initial, draft, onChange, categories, onSubmit, onCancel, saving = false, error }: Props) {
  const { title, url, category, tagsText, status, priority, notes } = draft;
  const [expanded, setExpanded] = useState(Boolean(initial || tagsText || category || status !== "todo" || priority !== 2));
  const optionsId = useId();
  const categoriesId = useId();
  const urlHintId = useId();
  const invalidUrl = Boolean(url.trim() && !safeMaterialUrl(url));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || saving || invalidUrl) return;
    const now = Date.now();
    const tags = Array.from(new Set(tagsText
      .split(/[,，、\n]/)
      .map((t) => t.trim())
      .filter(Boolean)));
    const next: Material = {
      id: draft.id,
      title: title.trim(),
      url: safeMaterialUrl(url),
      category: category.trim() || "未分类",
      tags,
      status,
      priority,
      notes: notes.trim() || undefined,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    };
    onSubmit(next);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset disabled={saving} className="space-y-4">
      <Field label="标题" required>
        <Input
          autoFocus
          required
          value={title}
          onChange={(e) => onChange("title", e.target.value)}
          placeholder="例如：React 官方文档 - Hooks 章节"
        />
      </Field>

      <Field label="链接（可选）">
        <Input
          type="url"
          value={url}
          onChange={(e) => onChange("url", e.target.value)}
          placeholder="https://..."
          aria-invalid={invalidUrl}
          aria-describedby={urlHintId}
        />
      </Field>
      <p id={urlHintId} className={"text-xs leading-relaxed " + (invalidUrl ? "status-error" : "text-[color:var(--text-muted)]")}>{invalidUrl ? "请输入不含用户名、密码的 http 或 https 链接；也可以留空只保存笔记。" : "支持 http / https 链接，不填写也可以保存笔记。"}</p>

      <Field label="备注">
        <Textarea value={notes} onChange={(e) => onChange("notes", e.target.value)} placeholder="记录学习目标、要点、心得..." />
      </Field>

      <div className="border-t border-[color:var(--border-subtle)] pt-2">
        <button type="button" aria-expanded={expanded} aria-controls={optionsId} onClick={() => setExpanded(!expanded)} className="button flex min-h-11 w-full items-center justify-between gap-2 rounded-lg text-left text-sm focus-ring">
          <span>更多选项<span className="ml-2 text-xs text-[color:var(--text-muted)]">分类、标签、学习状态</span></span><span aria-hidden>{expanded ? "−" : "+"}</span>
        </button>
        {!expanded && <p className="break-words text-xs leading-relaxed text-[color:var(--text-muted)]">{category || "未分类"} · {MATERIAL_STATUS_LABEL[status]} · {["高", "中", "低"][priority - 1]}优先级；展开可调整。</p>}
      </div>
      <div id={optionsId} hidden={!expanded} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="分类">
          <Input
            value={category}
            onChange={(e) => onChange("category", e.target.value)}
            list={categoriesId}
            placeholder="例如：前端、机器学习"
          />
          <datalist id={categoriesId}>{categories.map((item) => <option key={item} value={item} />)}</datalist>
        </Field>
        {categories.length > 0 && <div className="space-y-1 sm:col-span-2 sm:row-start-2">
          <p className="text-xs text-[color:var(--text-muted)]">选择已有分类，也可输入新分类</p>
          <div role="group" aria-label="已有分类建议" className="flex max-h-36 flex-wrap gap-1 overflow-y-auto">
            {categories.map((item) => <button key={item} type="button" aria-pressed={category === item} onClick={() => onChange("category", item)} className={"button min-h-11 max-w-full break-all rounded-lg border px-3 text-xs focus-ring " + (category === item ? "border-[color:var(--accent)] bg-[var(--accent-soft)] text-[color:var(--accent)]" : "button-secondary")}>{item}</button>)}
          </div>
        </div>}
        <Field label="标签（逗号分隔）">
          <Input
            value={tagsText}
            onChange={(e) => onChange("tagsText", e.target.value)}
            placeholder="React，Hooks，进阶（中英文逗号均可）"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="学习状态" grouped>
          <div className="grid grid-cols-3 gap-1.5">
            {STATUS_OPTIONS.map((opt) => (
              <button
                type="button"
                key={opt.value}
                onClick={() => onChange("status", opt.value)}
                aria-pressed={status === opt.value}
                className={
                  "button min-h-11 min-w-0 break-all rounded-xl border px-2 text-xs font-medium focus-ring " +
                  (status === opt.value
                    ? "border-[color:var(--accent)] bg-[var(--accent-soft)] text-[color:var(--accent)]"
                    : "button-secondary")
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="优先级" grouped>
          <div className="grid grid-cols-3 gap-1.5">
            {[1, 2, 3].map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => onChange("priority", p as 1 | 2 | 3)}
                aria-pressed={priority === p}
                className={
                  "button min-h-11 min-w-0 break-all rounded-xl border px-2 text-xs font-medium focus-ring " +
                  (priority === p
                    ? "border-[color:var(--accent)] bg-[var(--accent-soft)] text-[color:var(--accent)]"
                    : "button-secondary")
                }
              >
                {["高", "中", "低"][p - 1]} · P{p}
              </button>
            ))}
          </div>
        </Field>
      </div>

      </div>

      {error && <p role="alert" className="status-error text-sm">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-[color:var(--border-subtle)] pt-4">
        <Button className="max-w-full whitespace-normal break-words" type="button" variant="ghost" onClick={onCancel}>
          取消
        </Button>
        <Button className="max-w-full whitespace-normal break-words" type="submit" variant="primary" disabled={!title.trim() || saving || invalidUrl}>
          {saving ? "正在保存..." : initial ? "保存" : "添加"}
        </Button>
      </div>
      </fieldset>
    </form>
  );
}

function Field({
  label,
  required,
  grouped,
  children,
}: {
  label: string;
  required?: boolean;
  grouped?: boolean;
  children: React.ReactNode;
}) {
  if (grouped) return <fieldset>
    <legend className="mb-1.5 text-xs font-medium text-[color:var(--text-secondary)]">{label}</legend>
    {children}
  </fieldset>;
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-[color:var(--text-secondary)]">
        {label}
        {required && <span className="ml-0.5 text-rose-400">*</span>}
      </span>
      {children}
    </label>
  );
}
