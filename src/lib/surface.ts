/**
 * Feature-detected client routes.
 * 404/405/501 means the server does not have the route yet.
 * 400 means the route exists and rejected the input.
 */
import { ApiError, apiFetch } from "./api";
import { parseConnectors, type ConnectorRow } from "./connectors";
import { parseInbox, parseQuietHours, type InboxItem, type QuietHours } from "./inbox";
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
};

export async function probeSurfaces(): Promise<SurfaceFlags> {
  const [storage, search, connectors, reminders, routines] = await Promise.all([
    readRoute("/api/client/storage"),
    readRoute("/api/client/search?q="),
    readRoute("/api/client/connectors"),
    readRoute("/api/client/reminders"),
    readRoute("/api/client/routines"),
  ]);
  return {
    storage: routeExists(storage.state),
    search: routeExists(search.state),
    connectors: routeExists(connectors.state),
    reminders: routeExists(reminders.state) || routeExists(routines.state),
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

export async function postNotificationAction(
  id: string,
  action: "snooze" | "dismiss",
  minutes = 15,
): Promise<boolean> {
  const path = `/api/client/notifications/${encodeURIComponent(id)}/${action}`;
  const body = action === "snooze" ? JSON.stringify({ minutes }) : "{}";
  try {
    await apiFetch(path, { method: "POST", body });
    return true;
  } catch (error) {
    if (routeMissing(error)) return false;
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
