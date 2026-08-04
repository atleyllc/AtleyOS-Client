import * as SecureStore from "expo-secure-store";
import { normalizeClientApiBase } from "./apiBases";
import type { Session } from "./types";

const KEY = "atleyos.client.session.v1";

/** Rewrite dashboard :8080 → :8765; drop ephemeral trycloudflare Away URLs. */
function sanitizeSession(session: Session): Session {
  const lan =
    normalizeClientApiBase(session.lanApiBase) || session.lanApiBase || "";
  const overlay = normalizeClientApiBase(session.overlayApiBase) || "";
  const https = normalizeClientApiBase(session.httpsApiBase) || "";
  if (
    lan === session.lanApiBase &&
    overlay === (session.overlayApiBase || "") &&
    https === (session.httpsApiBase || "")
  ) {
    return session;
  }
  return {
    ...session,
    lanApiBase: lan,
    overlayApiBase: overlay,
    httpsApiBase: https,
  };
}

export async function loadSession(): Promise<Session | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    const next = sanitizeSession(parsed);
    if (next !== parsed) {
      await SecureStore.setItemAsync(KEY, JSON.stringify(next));
    }
    return next;
  } catch {
    return null;
  }
}

export async function saveSession(session: Session): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(sanitizeSession(session)));
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}

export async function updateSession(patch: Partial<Session>): Promise<Session | null> {
  const cur = await loadSession();
  if (!cur) return null;
  const next = sanitizeSession({ ...cur, ...patch });
  await saveSession(next);
  return next;
}
