import * as SecureStore from "expo-secure-store";
import type { Session } from "./types";

const KEY = "atleyos.session.v1";

export async function loadSession(): Promise<Session | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export async function saveSession(session: Session): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}

export async function updateSession(patch: Partial<Session>): Promise<Session | null> {
  const cur = await loadSession();
  if (!cur) return null;
  const next = { ...cur, ...patch };
  await saveSession(next);
  return next;
}
