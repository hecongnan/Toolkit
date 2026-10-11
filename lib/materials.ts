import type { Material, MaterialStatus } from "./types";

export const MATERIAL_STATUS_LABEL: Record<MaterialStatus, string> = {
  todo: "待学", doing: "进行中", done: "已完成",
};
export type MaterialSort = "newest" | "priority" | "updated";

export function safeMaterialUrl(value?: string): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password
      ? url.href : undefined;
  } catch { return undefined; }
}

export function materialMatches(material: Material, query: string): boolean {
  const normalize = (value: string) => value.normalize("NFKC").toLowerCase();
  const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
  const haystack = normalize([material.title, material.category, ...material.tags, material.notes ?? "", material.url ?? ""].join(" "));
  return terms.every((term) => haystack.includes(term));
}

export function sortMaterials(materials: Material[], order: MaterialSort): Material[] {
  return [...materials].sort((a, b) => {
    const difference = order === "priority" ? a.priority - b.priority
      : order === "updated" ? b.updatedAt - a.updatedAt : b.createdAt - a.createdAt;
    // A status change must not move cards under a user's finger by default.
    return difference || b.createdAt - a.createdAt || a.id.localeCompare(b.id);
  });
}

export function materialError(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string" && error.message.trim()) return error.message;
  return fallback;
}
