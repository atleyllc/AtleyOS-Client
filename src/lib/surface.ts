/**
 * Feature-detected client routes.
 * 404/405/501 means the server does not have the route yet.
 * 400 means the route exists and rejected the input.
 */
import { ApiError, apiFetch } from "./api";
import { parseCoding, type CodingSnapshot } from "./coding";
import { parseConnectors, type ConnectorRow } from "./connectors";
import { parseMachines, type MachinesSnapshot } from "./machines";
import { parseUsage, type UsageSnapshot } from "./aiUsage";
import { parseInbox, parseQuietHours, type InboxAction, type InboxItem, type QuietHours } from "./inbox";
import { parseReminders, parseRoutines, type ReminderRow, type RoutineRow } from "./reminders";
import { parseSearch, type SearchSnapshot } from "./searchParse";
import { parseStorage, type StorageSnapshot } from "./storage";

export type RouteState = "ok" | "missing" | "rejected" | "error" | "unreachable";

export type RouteRead = {
  state: RouteState;
  body: unknown;
  error: string;
};

export function routeMissing(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 405 || error.status === 501);
}

export async function readRoute(path: string): Promise<RouteRead> {
  try {
    const body = await apiFetch<unknown>(path);
    return { state: "ok", body, error: "" };
  } catch (error) {
    if (routeMissing(error)) return { state: "missing", body: null, error: "" };
    if (error instanceof ApiError && error.status === 400) return { state: "rejected", body: null, error: "" };
    if (error instanceof ApiError) return { state: "error", body: null, error: error.message };
    return {
      state: "unreachable",
      body: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function routeExists(state: RouteState): boolean {
  return state === "ok" || state === "rejected" || state === "error";
}

export type SurfaceFlags = {
  storage: boolean;
  search: boolean;
  connectors: boolean;
  reminders: boolean;
  machines: boolean;
  coding: boolean;
  usage: boolean;
};

export async function probeSurfaces(): Promise<SurfaceFlags> {
  const [storage, search, connectors, reminders, routines, machines, coding, usage] = await Promise.all([
    readRoute("/api/client/storage"),
    readRoute("/api/client/search?q="),
    readRoute("/api/client/connectors"),
    readRoute("/api/client/reminders"),
    readRoute("/api/client/routines"),
    readRoute("/api/client/machines"),
    readRoute("/api/client/coding"),
    readRoute("/api/client/ai-usage"),
  ]);
  return {
    storage: routeExists(storage.state),
    search: routeExists(search.state),
    connectors: routeExists(connectors.state),
    reminders: routeExists(reminders.state) || routeExists(routines.state),
    machines: routeExists(machines.state),
    coding: routeExists(coding.state),
    usage: routeExists(usage.state),
  };
}

const EMPTY_STORAGE: StorageSnapshot = { supported: false, health: "", drives: [], backup: null };

export async function loadStorage(): Promise<{ supported: boolean; snapshot: StorageSnapshot; error: string }> {
  const res = await readRoute("/api/client/storage");
  if (!routeExists(res.state)) return { supported: false, snapshot: EMPTY_STORAGE, error: res.error };
  const snapshot = parseStorage(res.body);
  return { supported: true, snapshot: { ...snapshot, supported: true }, error: res.error };
}

const EMPTY_SEARCH: SearchSnapshot = { supported: false, embeddingRoute: "", cloud: false, hits: [] };

export async function loadSearch(query: string): Promise<{ supported: boolean; snapshot: SearchSnapshot; error: string }> {
  const res = await readRoute(`/api/client/search?q=${encodeURIComponent(query)}`);
  if (!routeExists(res.state)) return { supported: false, snapshot: EMPTY_SEARCH, error: res.error };
  if (res.state !== "ok") return { supported: true, snapshot: { ...EMPTY_SEARCH, supported: true }, error: res.error };
  const snapshot = parseSearch(res.body);
  return { supported: true, snapshot: { ...snapshot, supported: true }, error: "" };
}

export async function loadConnectors(): Promise<{ supported: boolean; connectors: ConnectorRow[]; error: string }> {
  const res = await readRoute("/api/client/connectors");
  if (!routeExists(res.state)) return { supported: false, connectors: [], error: res.error };
  const parsed = parseConnectors(res.body);
  return { supported: true, connectors: parsed.connectors, error: res.error };
}

export async function loadReminders(): Promise<{ supported: boolean; reminders: ReminderRow[]; error: string }> {
  const res = await readRoute("/api/client/reminders");
  if (!routeExists(res.state)) return { supported: false, reminders: [], error: res.error };
  return { supported: true, reminders: parseReminders(res.body).reminders, error: res.error };
}

export async function loadRoutines(): Promise<{ supported: boolean; routines: RoutineRow[]; error: string }> {
  const res = await readRoute("/api/client/routines");
  if (!routeExists(res.state)) return { supported: false, routines: [], error: res.error };
  return { supported: true, routines: parseRoutines(res.body).routines, error: res.error };
}

export async function loadNotifications(): Promise<{ supported: boolean; items: InboxItem[]; error: string }> {
  const res = await readRoute("/api/client/notifications");
  if (!routeExists(res.state)) return { supported: false, items: [], error: res.error };
  return { supported: true, items: parseInbox(res.body).items, error: res.error };
}

/** One Inbox row by id (the event stream and pushes carry only the id). */
export async function fetchNotification(id: string): Promise<InboxItem | null> {
  if (!id) return null;
  try {
    const body = await apiFetch<{ notification?: unknown }>(`/api/client/notifications/${encodeURIComponent(id)}`);
    const row = body && typeof body === "object" ? (body as { notification?: unknown }).notification : null;
    return parseInbox({ notifications: row ? [row] : [] }).items[0] || null;
  } catch {
    return null;
  }
}

export type NotificationActionResult = {
  ok: boolean;
  /** Fix it: the first chat message, written by home. */
  prompt: string;
  title: string;
  /** Ask a follow-up: the chat that holds Cursor's plan. */
  conversationId: string;
  message: string;
};

function actionResult(body: unknown): NotificationActionResult {
  const root = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const result = root.result && typeof root.result === "object" ? (root.result as Record<string, unknown>) : {};
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    ok: result.ok !== false,
    prompt: str(result.prompt),
    title: str(result.title),
    conversationId: str(result.conversation_id),
    message: str(result.message) || str(result.summary),
  };
}

/**
 * POST /api/client/notifications/<id>/act {action}. Older homes only took
 * /<id>/snooze and /<id>/dismiss; those are tried when /act is missing.
 * Returns null when this home has no notification actions at all.
 */
export async function postNotificationAction(
  id: string,
  action: InboxAction,
  minutes = 15,
): Promise<NotificationActionResult | null> {
  const base = `/api/client/notifications/${encodeURIComponent(id)}`;
  try {
    const body = await apiFetch(`${base}/act`, {
      method: "POST",
      body: JSON.stringify({ action, snooze_minutes: minutes }),
    });
    return actionResult(body);
  } catch (error) {
    if (!routeMissing(error) || (action !== "snooze" && action !== "dismiss")) {
      if (routeMissing(error)) return null;
      throw error;
    }
  }
  try {
    const body = await apiFetch(`${base}/${action}`, {
      method: "POST",
      body: action === "snooze" ? JSON.stringify({ minutes }) : "{}",
    });
    return actionResult(body);
  } catch (error) {
    if (routeMissing(error)) return null;
    throw error;
  }
}

export async function loadServerQuietHours(): Promise<QuietHours | null> {
  const res = await readRoute("/api/client/quiet-hours");
  if (res.state !== "ok") return null;
  return parseQuietHours(res.body);
}

export async function saveServerQuietHours(quiet: QuietHours): Promise<boolean> {
  try {
    await apiFetch("/api/client/quiet-hours", {
      method: "PUT",
      body: JSON.stringify({
        quiet_hours: { enabled: quiet.enabled, start: quiet.start, end: quiet.end },
      }),
    });
    return true;
  } catch (error) {
    if (routeMissing(error)) return false;
    throw error;
  }
}

export async function loadMachines(): Promise<{ supported: boolean; snapshot: MachinesSnapshot; error: string }> {
  const res = await readRoute("/api/client/machines");
  if (!routeExists(res.state)) return { supported: false, snapshot: parseMachines(null), error: res.error };
  return { supported: true, snapshot: parseMachines(res.body), error: res.error };
}

export async function decideMachineJob(id: string, allow: boolean): Promise<void> {
  await apiFetch(`/api/client/machines/jobs/${encodeURIComponent(id)}/${allow ? "approve" : "deny"}`, {
    method: "POST",
    body: "{}",
  });
}

export async function loadCoding(): Promise<{ supported: boolean; snapshot: CodingSnapshot; error: string }> {
  const res = await readRoute("/api/client/coding");
  if (!routeExists(res.state)) return { supported: false, snapshot: parseCoding(null), error: res.error };
  return { supported: true, snapshot: parseCoding(res.body), error: res.error };
}

export async function cancelCodingJob(id: string): Promise<void> {
  await apiFetch(`/api/client/coding/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST", body: "{}" });
}

export async function loadUsage(refresh = false): Promise<{ supported: boolean; snapshot: UsageSnapshot; error: string }> {
  const res = await readRoute(`/api/client/ai-usage${refresh ? "?refresh=1" : ""}`);
  if (!routeExists(res.state)) return { supported: false, snapshot: parseUsage(null), error: res.error };
  return { supported: true, snapshot: parseUsage(res.body), error: res.error };
}
