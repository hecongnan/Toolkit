"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { uid } from "@/lib/storage";
import type { Material, MaterialStatus } from "@/lib/types";

interface Props {
  initial?: Material | null;
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

export function MaterialForm({ initial, onSubmit, onCancel, saving = false, error }: Props) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [status, setStatus] = useState<MaterialStatus>("todo");
  const [priority, setPriority] = useState<1 | 2 | 3>(2);
  const [notes, setNotes] = useState("");
  const [draftId] = useState(uid);

  useEffect(() => {
    if (initial) {
      setTitle(initial.title);
      setUrl(initial.url ?? "");
      setCategory(initial.category);
      setTagsText(initial.tags.join(", "));
      setStatus(initial.status);
      setPriority(initial.priority);
      setNotes(initial.notes ?? "");
    } else {
      setTitle("");
      setUrl("");
      setCategory("");
      setTagsText("");
      setStatus("todo");
      setPriority(2);
      setNotes("");
    }
  }, [initial]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || saving) return;
    const now = Date.now();
    const tags = tagsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const next: Material = {
      id: initial?.id ?? draftId,
      title: title.trim(),
      url: url.trim() || undefined,
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
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例如：React 官方文档 - Hooks 章节"
        />
      </Field>

      <Field label="链接（可选）">
        <Input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="分类">
          <Input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="例如：前端、机器学习"
          />
        </Field>
        <Field label="标签（逗号分隔）">
          <Input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="React, Hooks, 进阶"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="状态">
          <div className="flex gap-1.5">
            {STATUS_OPTIONS.map((opt) => (
              <button
                type="button"
                key={opt.value}
                onClick={() => setStatus(opt.value)}
                aria-pressed={status === opt.value}
                className={
                  "button min-h-11 flex-1 rounded-xl border px-3 text-xs font-medium focus-ring " +
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
        <Field label="优先级">
          <div className="flex gap-1.5">
            {[1, 2, 3].map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => setPriority(p as 1 | 2 | 3)}
                aria-pressed={priority === p}
                className={
                  "button min-h-11 flex-1 rounded-xl border px-3 text-xs font-medium focus-ring " +
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

      <Field label="备注">
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="记录学习目标、要点、心得..."
        />
      </Field>

      {error && <p role="alert" className="status-error text-sm">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-[color:var(--border-subtle)] pt-4">
        <Button type="button" variant="ghost" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" variant="primary" disabled={!title.trim() || saving}>
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
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-zinc-400">
        {label}
        {required && <span className="ml-0.5 text-rose-400">*</span>}
      </span>
      {children}
    </label>
  );
}
