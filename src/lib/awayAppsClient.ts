import { ApiError, apiFetch } from "./api";
import { hostFromApiBase } from "./homeApps";
import { loadSession } from "./session";
import { parseAwayApps, UNSUPPORTED, type AwayAppsStatus } from "./awayApps";
import { makeNonce, proofMatches } from "./homeProbe";

export async function loadAwayApps(): Promise<AwayAppsStatus> {
  try {
    return parseAwayApps(await apiFetch<unknown>("/api/client/away-apps"));
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 405)) return UNSUPPORTED;
    throw e;
  }
}

/** Ask home to retry the router mapping and its firewall rule. */
export async function checkAwayApps(): Promise<AwayAppsStatus> {
  try {
    return parseAwayApps(
      await apiFetch<unknown>("/api/client/away-apps/check", { method: "POST", body: "{}" }),
    );
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 405)) return UNSUPPORTED;
    throw e;
  }
}

/**
 * True when this phone's own home server answers on its home-network address.
 * With the VPN up (or WireGuard on iPhone), that address answers away too.
 *
 * No token goes out: the phone sends its device id and a random nonce, and
 * only a server holding this phone's token hash can return the right proof.
 * Another box on the same 192.168.8.x at a hotel can't.
 */
export async function homeLanAnswers(timeoutMs = 1500): Promise<boolean> {
  const session = await loadSession();
  if (!session || !hostFromApiBase(session.lanApiBase)) return false;
  return homeAnswersAt(session.lanApiBase, timeoutMs);
}

/** True when home answers through the VPN, on its overlay address. */
export async function overlayAnswers(timeoutMs = 2500): Promise<boolean> {
  const session = await loadSession();
  if (!session) return false;
  return homeAnswersAt(session.overlayApiBase || "http://10.55.0.1:8765", timeoutMs);
}

async function homeAnswersAt(base: string, timeoutMs: number): Promise<boolean> {
  const session = await loadSession();
  if (!session?.deviceId || !session.apiToken) return false;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const nonce = makeNonce();
    const res = await fetch(`${base}/api/client/home-probe`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: session.deviceId, nonce }),
      signal: ctrl.signal,
    });
    if (!res.ok) return false;
    return proofMatches(await res.json(), session.apiToken, nonce);
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}
