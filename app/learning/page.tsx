"use client";

import { BookOpen, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { MaterialCard } from "@/components/learning/MaterialCard";
import { MaterialForm } from "@/components/learning/MaterialForm";
import { createClient } from "@/lib/supabase/client";
import { toMaterial, type MaterialRow } from "@/lib/supabase/mappers";
import type { Material, MaterialStatus } from "@/lib/types";

const STATUS_FILTERS: Array<{ value: MaterialStatus | "all"; label: string }> = [
  { value: "all", label: "全部" },
  { value: "todo", label: "待学" },
  { value: "doing", label: "进行中" },
  { value: "done", label: "已完成" },
];

const STATUS_CYCLE: Record<MaterialStatus, MaterialStatus> = {
  todo: "doing",
  doing: "done",
  done: "todo",
};

export default function LearningPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Material | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<MaterialStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMaterials = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) return;
      setUserId(user.id);

      const { data, error: queryError } = await supabase
        .from("materials")
        .select("*")
        .order("updated_at", { ascending: false });
      if (queryError) throw queryError;
      setMaterials(((data ?? []) as MaterialRow[]).map(toMaterial));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "加载学习资料失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMaterials();
  }, [loadMaterials]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    materials.forEach((m) => m.category && set.add(m.category));
    return Array.from(set).sort();
  }, [materials]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return materials
      .filter((m) => statusFilter === "all" || m.status === statusFilter)
      .filter(
        (m) => categoryFilter === "all" || m.category === categoryFilter,
      )
      .filter((m) => {
        if (!q) return true;
        return (
          m.title.toLowerCase().includes(q) ||
          m.notes?.toLowerCase().includes(q) ||
          m.tags.some((t) => t.toLowerCase().includes(q)) ||
          m.category.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const statusRank: Record<MaterialStatus, number> = {
          doing: 0,
          todo: 1,
          done: 2,
        };
        if (statusRank[a.status] !== statusRank[b.status]) {
          return statusRank[a.status] - statusRank[b.status];
        }
        if (a.priority !== b.priority) return a.priority - b.priority;
        return b.updatedAt - a.updatedAt;
      });
  }, [materials, query, statusFilter, categoryFilter]);

  const upsert = async (m: Material) => {
    if (!userId) return;
    setError(null);
    try {
      const supabase = createClient();
      const payload = {
        id: m.id,
        user_id: userId,
        title: m.title,
        url: m.url ?? null,
        category: m.category,
        tags: m.tags,
        status: m.status,
        priority: m.priority,
        notes: m.notes ?? null,
        created_at: new Date(m.createdAt).toISOString(),
        updated_at: new Date(m.updatedAt).toISOString(),
      };

      if (editing) {
        const { error: updateError } = await supabase
          .from("materials")
          .update({
            title: payload.title,
            url: payload.url,
            category: payload.category,
            tags: payload.tags,
            status: payload.status,
            priority: payload.priority,
            notes: payload.notes,
            updated_at: payload.updated_at,
          })
          .eq("id", m.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase.from("materials").insert(payload);
        if (insertError) throw insertError;
      }

      await loadMaterials();
      setOpen(false);
      setEditing(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "保存学习资料失败");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("确定要删除这条资料吗？")) return;
    setError(null);
    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from("materials")
        .delete()
        .eq("id", id);
      if (deleteError) throw deleteError;
      setMaterials((prev) => prev.filter((m) => m.id !== id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "删除学习资料失败");
    }
  };

  const cycleStatus = async (id: string) => {
    const current = materials.find((m) => m.id === id);
    if (!current) return;
    const nextStatus = STATUS_CYCLE[current.status];
    const updatedAt = Date.now();
    setMaterials((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, status: nextStatus, updatedAt } : m,
      ),
    );

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("materials")
        .update({ status: nextStatus, updated_at: new Date(updatedAt).toISOString() })
        .eq("id", id);
      if (updateError) throw updateError;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "更新状态失败");
      await loadMaterials();
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Learning"
        title="学习资料"
        description="收藏、整理、追踪你的学习清单。状态、分类、标签随心组合。"
        action={
          <Button
            variant="primary"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus size={16} />
            添加资料
          </Button>
        }
      />

      {error && (
        <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      <div className="surface mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索标题、标签、备注..."
            className="pl-9"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-10 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-sm text-zinc-200 focus-ring hover:border-white/20"
        >
          <option value="all">全部分类</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div className="flex gap-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={
                "rounded-lg px-3 py-2 text-xs font-medium transition focus-ring " +
                (statusFilter === s.value
                  ? "bg-brand-gradient-soft text-zinc-50 ring-1 ring-fuchsia-400/30"
                  : "text-zinc-400 hover:text-zinc-100")
              }
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size={20} />
        </div>
      ) : materials.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={20} />}
          title="还没有学习资料"
          description="点击右上角的「添加资料」按钮，开始你的学习清单。"
          action={
            <Button
              variant="primary"
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus size={16} />
              添加第一份资料
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="没有匹配的资料" description="试试调整筛选条件或搜索关键词。" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((m) => (
            <MaterialCard
              key={m.id}
              material={m}
              onEdit={(mat) => {
                setEditing(mat);
                setOpen(true);
              }}
              onDelete={remove}
              onCycleStatus={cycleStatus}
            />
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setEditing(null);
        }}
        title={editing ? "编辑资料" : "添加资料"}
      >
        <MaterialForm
          initial={editing}
          onSubmit={upsert}
          onCancel={() => {
            setOpen(false);
            setEditing(null);
          }}
        />
      </Modal>
    </>
  );
}
