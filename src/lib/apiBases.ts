/**
 * Client API bases only — never dashboard :8080, never ephemeral trycloudflare.
 * Remaps mistaken :8080 → :8765 (LAN client API). Drops durable-invalid hosts.
 * Source of truth: HOST_E2E_HANDOFF.md
 */
export function normalizeClientApiBase(
  raw: string | undefined | null,
): string {
  const s = String(raw || "")
    .trim()
    .replace(/\/+$/, "");
  if (!s) return "";
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return "";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "";
  // Quick Tunnels are not a durable Away base.
  if (/\.trycloudflare\.com$/i.test(url.hostname)) return "";
  // Dashboard is browser-only; client API listens on :8765.
  if (url.port === "8080") {
    url.port = "8765";
  }
  return url.toString().replace(/\/+$/, "");
}

/** 127.0.0.1 / localhost / ::1 — on a phone this is the phone, not the home server. */
export function isLoopbackClientBase(raw: string | undefined | null): boolean {
  const s = normalizeClientApiBase(raw);
  if (!s) return false;
  let host = "";
  try {
    host = new URL(s).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  } catch {
    return false;
  }
  if (host === "localhost" || host === "::1" || host === "0.0.0.0") return true;
  return /^127(?:\.\d{1,3}){3}$/.test(host);
}

/**
 * Unpaired fallback. Real devices must pass allowLoopback=false so the phone
 * never dials itself. Simulators and web (isDevice === false) may use loopback.
 */
export function unpairedFallbackBases(allowLoopback: boolean): string[] {
  return allowLoopback ? ["http://127.0.0.1:8765"] : [];
}

/**
 * HTTPS-first reachability:
 * - Home VPN up → overlay, then HTTPS, then LAN
 * - Off home Wi-Fi with Away URL → HTTPS only (skip LAN/overlay black holes)
 * - On Wi-Fi, no VPN → HTTPS (if set), LAN, overlay last
 * Loopback bases are dropped when allowLoopback is false.
 * Away is dropped when the host says the tunnel is not ready (httpsReady === false).
 */
export function orderedApiBases(
  session: {
    httpsApiBase?: string | null;
    lanApiBase?: string | null;
    overlayApiBase?: string | null;
  },
  opts: {
    homeVpnUp?: boolean;
    onWifi?: boolean;
    allowLoopback?: boolean;
    httpsReady?: boolean;
  } = {},
): string[] {
  const https = normalizeClientApiBase(session.httpsApiBase);
  const overlay = normalizeClientApiBase(session.overlayApiBase);
  const lan = normalizeClientApiBase(session.lanApiBase);
  const homeVpnUp = Boolean(opts.homeVpnUp);
  const onWifi = opts.onWifi !== false;
  let list: string[];
  if (homeVpnUp) {
    list = [overlay, https, lan];
  } else if (!onWifi && https) {
    list = [https];
  } else {
    list = [https, lan, overlay];
  }
  let unique = [...new Set(list.filter(Boolean))];
  if (opts.httpsReady === false && https) {
    unique = unique.filter((base) => base !== https);
  }
  if (opts.allowLoopback === false) {
    unique = unique.filter((base) => !isLoopbackClientBase(base));
  }
  return unique;
}
