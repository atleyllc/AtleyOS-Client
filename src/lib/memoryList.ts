export type MemoryItem = {
  id: string;
  text: string;
  kind: string | null;
  updatedAt: number | null;
};

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readTime(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function parseMemory(body: unknown): { supported: boolean; items: MemoryItem[] } {
  const rec = record(body);
  if (!rec) return { supported: false, items: [] };
  let raw: unknown[] | null = null;
  for (const key of ["items", "memories", "facts", "memory", "data"]) {
    if (Array.isArray(rec[key])) {
      raw = rec[key] as unknown[];
      break;
    }
  }
  if (!raw) return { supported: false, items: [] };
  const items: MemoryItem[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const row = record(item);
    if (!row) continue;
    const id = text(row.id) || text(row.memory_id) || "";
    const value = text(row.text) || text(row.content) || text(row.body) || text(row.fact);
    if (!id || !value || seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      text: value,
      kind: text(row.kind) || text(row.type) || null,
      updatedAt: readTime(row.updated_at ?? row.updatedAt ?? row.created_at),
    });
  }
  return { supported: true, items };
}
