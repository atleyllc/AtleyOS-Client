/**
 * One inbox for reminders, routine results, approvals, alerts, and storage knocks.
 * storage_alert is dismiss-only. Erase, move, and restore are not phone actions.
 */

export type InboxKind = "reminder" | "routine" | "approval" | "alert" | "storage_alert";

export type InboxAction = "approve" | "deny" | "snooze" | "open" | "dismiss";

export type InboxItem = {
  id: string;
  kind: InboxKind;
  title: string;
  body: string;
  createdAt: number | null;
  openUrl: string;
  actions: InboxAction[];
};

export type QuietHours = {
  enabled: boolean;
  start: string;
  end: string;
};

export const DEFAULT_QUIET: QuietHours = { enabled: false, start: "22:00", end: "07:00" };

const KINDS = new Set<InboxKind>(["reminder", "routine", "approval", "alert", "storage_alert"]);

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

export function inboxKind(value: unknown): InboxKind | null {
  const raw = text(value).toLowerCase().replace(/-/g, "_");
  if (raw === "routine_result" || raw === "routine_results") return "routine";
  if (raw === "storagealert") return "storage_alert";
  if (KINDS.has(raw as InboxKind)) return raw as InboxKind;
  return null;
}

export function actionsForKind(kind: InboxKind): InboxAction[] {
  if (kind === "storage_alert") return ["dismiss"];
  if (kind === "approval") return ["approve", "deny"];
  if (kind === "reminder") return ["snooze", "open", "dismiss"];
  if (kind === "routine") return ["open", "dismiss"];
  return ["open", "dismiss"];
}

export function noticeTitle(kind: InboxKind): string {
  if (kind === "approval") return "Something is waiting.";
  if (kind === "reminder") return "A reminder is ready.";
  if (kind === "routine") return "A routine finished.";
  return "Home sent an alert.";
}

function itemFromRow(row: Record<string, unknown>): InboxItem | null {
  const kind = inboxKind(row.kind ?? row.type ?? row.event) || "alert";
  const id = text(row.id) || text(row.notification_id) || text(row.approval_id);
  if (!id) return null;
  const explicit = Array.isArray(row.actions)
    ? row.actions.map((action) => text(action).toLowerCase()).filter((action): action is InboxAction =>
        action === "approve" ||
        action === "deny" ||
        action === "snooze" ||
        action === "open" ||
        action === "dismiss",
      )
    : [];
  const actions: InboxAction[] =
    kind === "storage_alert" ? ["dismiss"] : explicit.length ? explicit : actionsForKind(kind);
  const allowed: InboxAction[] =
    kind === "storage_alert" ? ["dismiss"] : actions.filter((action) => action !== "approve" || kind === "approval");
  return {
    id,
    kind,
    title: text(row.title) || text(row.name) || noticeTitle(kind),
    body: text(row.body) || text(row.summary) || text(row.message) || text(row.detail),
    createdAt: readTime(row.created_at ?? row.createdAt ?? row.at),
    openUrl: text(row.open_url) || text(row.href) || text(row.url),
    actions: allowed,
  };
}

export function parseInbox(body: unknown): { supported: boolean; items: InboxItem[] } {
  const root = record(body);
  if (!root) return { supported: false, items: [] };
  let raw: unknown[] | null = null;
  for (const key of ["notifications", "inbox", "items", "knocks", "events"]) {
    if (Array.isArray(root[key])) {
      raw = root[key] as unknown[];
      break;
    }
  }
  if (!raw) return { supported: false, items: [] };
  const items: InboxItem[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const row = record(item);
    if (!row) continue;
    const parsed = itemFromRow(row);
    if (!parsed || seen.has(parsed.id)) continue;
    seen.add(parsed.id);
    items.push(parsed);
  }
  return { supported: true, items };
}

export function noticeFromEvent(eventName: string, payload: unknown): InboxItem | null {
  const data = record(payload) || {};
  let kind = inboxKind(data.kind ?? data.type) || inboxKind(eventName);
  if (!kind && (eventName === "knock" || eventName === "notification" || eventName === "alert")) {
    kind = "alert";
  }
  if (!kind || kind === "approval") return null;
  const id = text(data.id) || text(data.notification_id) || `${kind}-${text(data.at) || "live"}`;
  return itemFromRow({ ...data, id, kind });
}

function minutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function parseQuietHours(body: unknown): QuietHours | null {
  const root = record(body);
  const quiet = root ? record(root.quiet_hours) || root : null;
  if (!quiet) return null;
  const start = text(quiet.start) || text(quiet.from);
  const end = text(quiet.end) || text(quiet.to);
  if (!minutes(start) || minutes(end) == null) return null;
  const enabled =
    typeof quiet.enabled === "boolean"
      ? quiet.enabled
      : typeof quiet.on === "boolean"
        ? quiet.on
        : true;
  return { enabled, start, end };
}

/** Overnight windows (22:00–07:00) count as quiet. Invalid times are not quiet. */
export function isQuietAt(quiet: QuietHours, now: Date): boolean {
  if (!quiet.enabled) return false;
  const start = minutes(quiet.start);
  const end = minutes(quiet.end);
  if (start == null || end == null) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  if (start === end) return true;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

export function snoozeUntil(now: number, minutesAhead = 15): number {
  return now + minutesAhead * 60_000;
}
