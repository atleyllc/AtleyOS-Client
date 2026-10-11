import { ApiError, apiFetch } from "./api";
import { hostFromApiBase } from "./homeApps";
import { loadSession } from "./session";
import { parseAwayApps, UNSUPPORTED, type AwayAppsStatus } from "./awayApps";

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
 * True when the home server answers on its home-network address directly.
 * Call with the VPN down: with it up, that address answers away too.
 */
export async function homeLanAnswers(timeoutMs = 1500): Promise<boolean> {
  const session = await loadSession();
  const host = hostFromApiBase(session?.lanApiBase);
  if (!session || !host) return false;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${session.lanApiBase}/api/client/status`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${session.apiToken}` },
      signal: ctrl.signal,
    });
    // Only our own server with this phone's token says 200. Another router on
    // the same 192.168.8.x range at a hotel won't.
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}
