"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toMaterial, type MaterialRow } from "@/lib/supabase/mappers";
import { materialError, MATERIAL_STATUS_LABEL } from "@/lib/materials";
import type { Material, MaterialStatus } from "@/lib/types";

export function useMaterials() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [failedStatuses, setFailedStatuses] = useState<Record<string, MaterialStatus>>({});
  const userRef = useRef<string | null>(null);
  const loadedRef = useRef(false);
  const requestRef = useRef(0);
  const pendingRef = useRef(new Set<string>());

  const load = useCallback(async () => {
    if (pendingRef.current.size) return;
    const request = ++requestRef.current;
    if (loadedRef.current) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);
    try {
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error("登录状态已失效，请重新登录。");
      userRef.current = user.id;
      const { data, error } = await supabase.from("materials").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
      if (error) throw error;
      if (request !== requestRef.current) return;
      setMaterials(((data ?? []) as MaterialRow[]).map(toMaterial));
      loadedRef.current = true;
      setLoadFailed(false);
      setRowErrors({});
      setFailedStatuses({});
    } catch (error) {
      if (request === requestRef.current) {
        setLoadError(materialError(error, "加载学习资料失败，请重试。"));
        setLoadFailed(!loadedRef.current);
      }
    } finally {
      if (request === requestRef.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  useEffect(() => { void load(); return () => { requestRef.current += 1; }; }, [load]);

  const begin = (id: string) => {
    if (!loadedRef.current || !userRef.current || pendingRef.current.has(id)) return false;
    requestRef.current += 1;
    setRefreshing(false);
    pendingRef.current.add(id);
    setPendingIds(new Set(pendingRef.current));
    setRowErrors((previous) => { const next = { ...previous }; delete next[id]; return next; });
    setFailedStatuses((previous) => { const next = { ...previous }; delete next[id]; return next; });
    return true;
  };
  const finish = (id: string) => {
    pendingRef.current.delete(id);
    setPendingIds(new Set(pendingRef.current));
  };
  const reconcile = (saved: Material) => setMaterials((items) => items.some((item) => item.id === saved.id)
    ? items.map((item) => item.id === saved.id ? saved : item) : [saved, ...items]);

  const updateStatus = async (id: string, status: MaterialStatus) => {
    const current = materials.find((material) => material.id === id);
    if (!current || current.status === status || !begin(id)) return;
    const optimistic = { ...current, status, updatedAt: Date.now() };
    setMaterials((items) => items.map((item) => item.id === id ? optimistic : item));
    try {
      const { data, error } = await createClient().from("materials").update({ status, updated_at: new Date(optimistic.updatedAt).toISOString() })
        .eq("id", id).eq("user_id", userRef.current!).select("*").single();
      if (error) throw error;
      if (!data) throw new Error("资料状态未保存，请重试。");
      reconcile(toMaterial(data as MaterialRow));
    } catch (error) {
      setMaterials((items) => items.map((item) => item.id === id ? current : item));
      setRowErrors((previous) => ({ ...previous, [id]: `状态未保存，已恢复为${MATERIAL_STATUS_LABEL[current.status]}。${materialError(error, "请重试。")}` }));
      setFailedStatuses((previous) => ({ ...previous, [id]: status }));
    } finally { finish(id); }
  };

  const save = async (material: Material, editing: boolean): Promise<boolean> => {
    if (!begin(material.id)) return false;
    try {
      const payload = {
        title: material.title, url: material.url ?? null, category: material.category, tags: material.tags,
        status: material.status, priority: material.priority, notes: material.notes ?? null,
        updated_at: new Date(material.updatedAt).toISOString(),
      };
      const table = createClient().from("materials");
      const query = editing
        ? table.update(payload).eq("id", material.id).eq("user_id", userRef.current!)
        : table.upsert({ ...payload, id: material.id, user_id: userRef.current!, created_at: new Date(material.createdAt).toISOString() }, { onConflict: "id" });
      const { data, error } = await query.select("*").single();
      if (error) throw error;
      if (!data) throw new Error("资料未保存，请重试。");
      reconcile(toMaterial(data as MaterialRow));
      return true;
    } finally { finish(material.id); }
  };

  const remove = async (id: string): Promise<boolean> => {
    if (!begin(id)) return false;
    try {
      const { data, error } = await createClient().from("materials").delete().eq("id", id).eq("user_id", userRef.current!).select("id").single();
      if (error) throw error;
      if (!data) throw new Error("资料未删除，请重试。");
      setMaterials((items) => items.filter((item) => item.id !== id));
      return true;
    } finally { finish(id); }
  };

  return { materials, loading, refreshing, loadFailed, loadError, pendingIds, rowErrors, failedStatuses, load, updateStatus, save, remove };
}
