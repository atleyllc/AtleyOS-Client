/** Pure helpers for the chat list and chat errors (no network, testable). */

export type ChatRow = {
  id: string;
  title: string;
  createdAt: number | null;
  updatedAt: number | null;
  preview: string;
  messageCount: number;
  pinned: boolean;
  archived: boolean;
  /** "title" when the search hit the title, else a snippet around the hit. */
  match: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function time(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value > 1e12 ? value : value * 1000;
  const parsed = typeof value === "string" && value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseChatRows(body: unknown): ChatRow[] | null {
  const root = record(body);
  if (!root || !Array.isArray(root.conversations)) return null;
  const rows: ChatRow[] = [];
  for (const item of root.conversations) {
    const rec = record(item);
    const id = rec ? str(rec.id) : "";
    if (!rec || !id) continue;
    rows.push({
      id,
      title: str(rec.title) || "New chat",
      createdAt: time(rec.created_at),
      updatedAt: time(rec.updated_at) ?? time(rec.created_at),
      preview: str(rec.preview),
      messageCount: typeof rec.message_count === "number" ? rec.message_count : 0,
      pinned: rec.pinned === true,
      archived: rec.archived === true,
      match: str(rec.match),
    });
  }
  return rows;
}

/** Pinned first, then "Today", "Yesterday", "Last 7 days", "Older". */
export function groupChats(rows: ChatRow[], now = new Date()): { label: string; rows: ChatRow[] }[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  const groups: { label: string; rows: ChatRow[] }[] = [
    { label: "Pinned", rows: [] },
    { label: "Today", rows: [] },
    { label: "Yesterday", rows: [] },
    { label: "Last 7 days", rows: [] },
    { label: "Older", rows: [] },
  ];
  for (const row of rows) {
    const at = row.updatedAt ?? 0;
    const index = row.pinned ? 0 : at >= start ? 1 : at >= start - day ? 2 : at >= start - 7 * day ? 3 : 4;
    groups[index].rows.push(row);
  }
  return groups.filter((group) => group.rows.length);
}

function statusOf(error: unknown): number {
  const status = error && typeof error === "object" ? (error as { status?: unknown }).status : 0;
  return typeof status === "number" ? status : 0;
}

/** Plain words for what went wrong in Chat. Never the stale-pair text unless home said 401. */
export function friendlyChatError(error: unknown): { text: string; repair: boolean; pair: boolean } {
  const msg = error instanceof Error ? error.message : String(error);
  const status = statusOf(error);
  if (error instanceof Error && error.name === "NotPairedError") {
    return { text: `${msg}\n\nTap Pair with home above.`, repair: false, pair: true };
  }
  if (status === 401) {
    return {
      text: "Home didn’t recognise this phone. On home Wi‑Fi, tap Re-pair and scan a fresh dashboard QR, then send again.",
      repair: true,
      pair: false,
    };
  }
  if (status === 413) return { text: "That file is too big for home. Try a smaller one.", repair: false, pair: false };
  if (status === 400) return { text: msg, repair: false, pair: false };
  if (status === 503) {
    return { text: "Home is starting up or busy. Wait a moment and tap Retry.", repair: false, pair: false };
  }
  if (status >= 500) return { text: `Home hit an error (${status}). Tap Retry.`, repair: false, pair: false };
  if (/didn’t answer in time/.test(msg)) {
    return { text: "Home took too long to answer. The model may still be loading; tap Retry.", repair: false, pair: false };
  }
  if (msg.startsWith("Couldn’t reach home")) return { text: msg, repair: false, pair: false };
  return { text: `Couldn’t reach home: ${msg}`, repair: false, pair: false };
}
