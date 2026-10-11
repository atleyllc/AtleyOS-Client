import AsyncStorage from "@react-native-async-storage/async-storage";
import type { InboxItem } from "./inbox";

const KEY = "atleyos.client.inbox.notices.v1";

type StoredNotice = InboxItem & { snoozeUntil?: number; dismissed?: boolean };

async function readAll(): Promise<StoredNotice[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is StoredNotice => !!item && typeof item === "object" && typeof (item as StoredNotice).id === "string");
  } catch {
    return [];
  }
}

async function writeAll(items: StoredNotice[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(items.slice(-100)));
}

export async function loadVisibleNotices(now = Date.now()): Promise<InboxItem[]> {
  const all = await readAll();
  return all
    .filter((item) => !item.dismissed && (!item.snoozeUntil || item.snoozeUntil <= now))
    .map(({ snoozeUntil: _snooze, dismissed: _dismissed, ...item }) => item);
}

export async function rememberNotice(item: InboxItem): Promise<void> {
  const all = await readAll();
  const next = all.filter((row) => row.id !== item.id);
  next.push(item);
  await writeAll(next);
}

export async function dismissNotice(id: string): Promise<void> {
  const all = await readAll();
  await writeAll(all.map((item) => (item.id === id ? { ...item, dismissed: true } : item)));
}

export async function snoozeNotice(id: string, until: number): Promise<void> {
  const all = await readAll();
  const found = all.some((item) => item.id === id);
  const next = all.map((item) => (item.id === id ? { ...item, snoozeUntil: until, dismissed: false } : item));
  if (!found) next.push({ id, kind: "alert", title: "Home sent an alert.", body: "", createdAt: null, openUrl: "", actions: ["dismiss"], snoozeUntil: until });
  await writeAll(next);
}
