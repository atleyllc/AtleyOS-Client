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
    const value = text(row.text) || text(row.content) || text(row.body);
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

export const MEMORY_KINDS = [
  "relationship",
  "preference",
  "correction",
  "decision",
  "pattern",
  "context",
] as const;

export const MEMORY_TEXT_MAX = 4000;

export function validateMemoryText(value: string): "empty_text" | "text_too_long" | null {
  const trimmed = value.trim();
  if (!trimmed) return "empty_text";
  if (trimmed.length > MEMORY_TEXT_MAX) return "text_too_long";
  return null;
}

export function memoryErrorCopy(code: string): string {
  switch (code) {
    case "empty_text":
      return "Write a note before saving.";
    case "text_too_long":
      return "That note is longer than 4000 characters.";
    case "invalid_kind":
      return "Home rejected that memory kind.";
    case "missing_id":
      return "Home didn’t receive which note to forget.";
    case "owner_required":
      return "Only the Owner can change Memory.";
    case "not_found":
      return "Home doesn’t have that note.";
    default:
      return "";
  }
}
