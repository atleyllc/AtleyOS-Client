/**
 * One inbox for reminders, routine results, approvals, alerts, and storage knocks.
 * storage_alert is dismiss-only. Erase, move, and restore are not phone actions.
 */

export type InboxKind = "reminder" | "routine" | "approval" | "alert" | "storage_alert";

export type InboxAction =
  | "approve"
  | "deny"
  | "snooze"
  | "open"
  | "dismiss"
  | "fix"
  | "retry"
  | "approve_plan"
  | "followup";

export type InboxItem = {
  id: string;
  kind: InboxKind;
  title: string;
  body: string;
  createdAt: number | null;
  openUrl: string;
  actions: InboxAction[];
  /** One plain paragraph from home: what happened and what to do. */
  explanation?: string;
  /** Home's own kind (backup, storage, health, machines, coding, …). */
  source?: string;
  status?: string;
  snoozedUntil?: number | null;
};

const ACTION_IDS = new Set<InboxAction>([
  "approve",
  "deny",
  "snooze",
  "open",
  "dismiss",
  "fix",
  "retry",
  "approve_plan",
  "followup",
]);

/** Kinds whose text home writes itself. Their real title and reason may show in the shade. */
const SYSTEM_SOURCES = new Set(["backup", "storage", "storage_alert", "health", "machines", "approval", "coding", "alert"]);

/** Done rows stay in home's history but not in the phone's Inbox. */
const CLOSED = new Set(["dismissed", "acted", "resolved", "done"]);

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
  return ["open", "dismiss"];
}

export function noticeTitle(kind: InboxKind): string {
  if (kind === "approval") return "Something is waiting.";
  if (kind === "reminder") return "A reminder is ready.";
  if (kind === "routine") return "A routine finished.";
  return "Home sent an alert.";
}

/** Home sends actions as ids or as {id, label, enabled}. Disabled ones are dropped. */
export function readActions(value: unknown): InboxAction[] {
  if (!Array.isArray(value)) return [];
  const out: InboxAction[] = [];
  for (const entry of value) {
    let id = "";
    if (typeof entry === "string") id = entry;
    else {
      const row = record(entry);
      if (!row || row.enabled === false) continue;
      id = text(row.id);
    }
    const clean = id.trim().toLowerCase() as InboxAction;
    if (ACTION_IDS.has(clean) && !out.includes(clean)) out.push(clean);
  }
  return out;
}

function itemFromRow(row: Record<string, unknown>): InboxItem | null {
  const rawKind = text(row.kind ?? row.type ?? row.event).toLowerCase();
  const kind = inboxKind(rawKind) || "alert";
  const id = text(row.id) || text(row.notification_id) || text(row.approval_id);
  if (!id) return null;
  const explicit = readActions(row.actions);
  const actions: InboxAction[] = explicit.length ? explicit : actionsForKind(kind);
  // Storage alerts never erase, move, or restore from the phone: Fix it (a chat) and Dismiss only.
  const allowed: InboxAction[] =
    kind === "storage_alert"
      ? actions.filter((action) => action === "dismiss" || action === "fix").concat(actions.includes("dismiss") ? [] : ["dismiss"])
      : actions.filter((action) => action !== "approve" || kind === "approval");
  let openUrl = text(row.open_url) || text(row.url);
  if (!openUrl && Array.isArray(row.actions)) {
    const open = row.actions.map(record).find((entry) => entry && text(entry.id) === "open");
    const href = open ? text(open.href) : "";
    if (/^https?:\/\//i.test(href)) openUrl = href;
  }
  if (!openUrl && /^https?:\/\//i.test(text(row.href))) openUrl = text(row.href);
  return {
    id,
    kind,
    title: text(row.title) || text(row.name) || noticeTitle(kind),
    body: text(row.body) || text(row.summary) || text(row.message) || text(row.detail),
    createdAt: readTime(row.created_at ?? row.createdAt ?? row.at),
    openUrl,
    actions: allowed,
    explanation: text(row.explanation),
    source: rawKind || kind,
    status: text(row.status).toLowerCase(),
    snoozedUntil: readTime(row.snoozed_until),
  };
}

export function isOpenItem(item: InboxItem, now = Date.now()): boolean {
  if (CLOSED.has(item.status || "")) return false;
  if (item.status === "snoozed" && item.snoozedUntil && item.snoozedUntil > now) return false;
  return true;
}

/**
 * What the phone's own notification says. Home-written alerts (backup, storage,
 * health, machines, approvals, coding) show their real title and one-line reason.
 * Reminders, routines, and connector events can quote your own content, so the
 * shade stays generic for them; the Inbox has the details.
 */
export function noticeLines(item: Pick<InboxItem, "kind" | "title" | "body" | "source">): { title: string; body: string } {
  const source = (item.source || item.kind || "").toLowerCase();
  if (!SYSTEM_SOURCES.has(source) || !item.title) {
    return { title: "AtleyOS", body: noticeTitle(item.kind) };
  }
  const clip = (value: string, cap: number) => {
    const one = value.replace(/\s+/g, " ").trim();
    return one.length <= cap ? one : `${one.slice(0, cap - 1).trimEnd()}…`;
  };
  return { title: clip(item.title, 65), body: clip(item.body, 160) || noticeTitle(item.kind) };
}

/** "Today 2:06 AM", "Yesterday 9:12 PM", or "Oct 3, 4:00 PM". */
export function whenLabel(ms: number | null, now = new Date()): string {
  if (ms == null) return "";
  const at = new Date(ms);
  const time = at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(now) - day(at)) / 86_400_000);
  if (diff === 0) return `Today ${time}`;
  if (diff === 1) return `Yesterday ${time}`;
  return `${at.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
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
    if (!parsed || seen.has(parsed.id) || !isOpenItem(parsed)) continue;
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
