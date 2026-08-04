import * as Network from "expo-network";
import type { HomeApp, PairPayload, Session } from "./types";
import { loadSession, saveSession, updateSession } from "./session";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/**
 * HTTPS-first reachability:
 * - Home VPN up → overlay, then HTTPS, then LAN
 * - Off home Wi‑Fi with Away URL → HTTPS only (skip LAN/overlay black holes)
 * - On Wi‑Fi, no VPN → HTTPS (if set), LAN, overlay last
 */
function bases(
  session: Session,
  opts: { homeVpnUp?: boolean; onWifi?: boolean } = {},
): string[] {
  const https = session.httpsApiBase || "";
  const overlay = session.overlayApiBase || "";
  const lan = session.lanApiBase || "";
  const homeVpnUp = Boolean(opts.homeVpnUp);
  const onWifi = opts.onWifi !== false;
  let list: string[];
  if (homeVpnUp) {
    list = [overlay, https, lan];
  } else if (!onWifi && https) {
    // Cellular / non-Wi‑Fi: Chat must not wait on unreachable LAN or a dead VPN.
    list = [https];
  } else {
    list = [https, lan, overlay];
  }
  return [...new Set(list.filter(Boolean))];
}

/** Cache last working API base so chat does not burn a long timeout on a dead hop. */
let preferredBase: { base: string; until: number } | null = null;

function rememberBase(base: string) {
  preferredBase = { base, until: Date.now() + 45_000 };
}

/** Call when Wi‑Fi/cellular changes so we do not keep hammering a dead LAN base. */
export function clearPreferredBase(): void {
  preferredBase = null;
}

async function onHomeWifi(): Promise<boolean> {
  try {
    const net = await Network.getNetworkStateAsync();
    return net.type === Network.NetworkStateType.WIFI;
  } catch {
    return false;
  }
}

async function homeVpnTunnelUp(): Promise<boolean> {
  try {
    const { getTunnelState, isTunnelPaused } = await import("./wireguard");
    if (await isTunnelPaused()) return false;
    const st = await getTunnelState();
    return st.status === "up" && st.mode === "overlay";
  } catch {
    return false;
  }
}

async function orderedBases(session: Session): Promise<string[]> {
  const vpnUp = await homeVpnTunnelUp();
  const wifi = await onHomeWifi();
  const all = bases(session, { homeVpnUp: vpnUp, onWifi: wifi });
  // Away from Wi‑Fi: never prefer a cached LAN hop — it will hang Chat.
  if (!wifi) {
    if (
      preferredBase?.base &&
      (preferredBase.base === session.lanApiBase ||
        preferredBase.base === session.overlayApiBase)
    ) {
      preferredBase = null;
    }
    return all;
  }
  const pref = preferredBase;
  if (!pref || pref.until < Date.now()) return all;
  if (!all.includes(pref.base)) return all;
  return [pref.base, ...all.filter((b) => b !== pref.base)];
}

async function rawFetch(
  base: string,
  path: string,
  init: RequestInit & { token?: string; timeoutMs?: number } = {},
): Promise<Response> {
  const { token, timeoutMs: timeoutOverride, signal, headers: initHeaders, ...rest } = init;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(initHeaders as Record<string, string>),
  };
  if (rest.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const ctrl = new AbortController();
  // Chat waits on the home LLM; pair redeem can also be a bit slower.
  let timeoutMs = timeoutOverride ?? 12000;
  if (timeoutOverride == null) {
    if (path.includes("/v1/chat/completions")) timeoutMs = 180000;
    else if (path.includes("/pair/redeem")) timeoutMs = 20000;
  }
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(`${base.replace(/\/$/, "")}${path}`, {
      ...rest,
      headers,
      signal: signal ?? ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Quick probe so we do not spend the chat timeout on an unreachable overlay/LAN hop. */
async function pickReachableBase(
  session: Session,
  token?: string,
): Promise<string[]> {
  const ordered = await orderedBases(session);
  if (ordered.length <= 1) return ordered;
  const wifi = await onHomeWifi();
  // Probe in parallel; keep preference order from orderedBases.
  const settled = await Promise.all(
    ordered.map(async (base) => {
      try {
        const res = await clientFetch(base, "/api/client/status", {
          token,
          // LAN/overlay often black-hole on cellular — fail fast off Wi‑Fi.
          timeoutMs:
            !wifi &&
            (base === session.lanApiBase || base === session.overlayApiBase)
              ? 1200
              : 2500,
        });
        return res.status > 0 ? base : null;
      } catch {
        return null;
      }
    }),
  );
  const winners = ordered.filter((b) => settled.includes(b));
  if (winners.length) {
    rememberBase(winners[0]);
    // Chat must not fall through to 180s timeouts on dead hops.
    return winners;
  }
  // No probe winner: fail fast (especially off Wi‑Fi) instead of hanging Chat.
  if (!wifi) return [];
  return ordered.slice(0, 1);
}

/** Prefer /api/client/*; fall back to legacy /api/mobile/* on older hosts. */
async function clientFetch(
  base: string,
  clientPath: string,
  init: RequestInit & { token?: string; timeoutMs?: number } = {},
): Promise<Response> {
  const primary = await rawFetch(base, clientPath, init);
  if (primary.status !== 404) return primary;
  const legacy = clientPath.replace(/^\/api\/client\//, "/api/mobile/");
  if (legacy === clientPath) return primary;
  return rawFetch(base, legacy, init);
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit & { token?: string; session?: Session | null } = {},
): Promise<T> {
  const session = init.session === undefined ? await loadSession() : init.session;
  const token = init.token ?? session?.apiToken;
  const isChat = path.includes("/v1/chat/completions");
  const tryBases = session
    ? isChat
      ? await pickReachableBase(session, token)
      : await orderedBases(session)
    : ["http://127.0.0.1:8765"];
  if (session && tryBases.length === 0) {
    const wifi = await onHomeWifi();
    throw new Error(
      !wifi && !session.httpsApiBase
        ? "Away HTTPS is not on this phone yet. On home Wi‑Fi: finish Away access on the dashboard, open Chat once (or re-pair), then try again."
        : !wifi
          ? "Away HTTPS unreachable. Confirm cloudflared is running at home and the Away URL is correct."
          : "No home address reachable. Is AtleyOS running on this Wi‑Fi?",
    );
  }
  let lastErr: unknown;
  for (const base of tryBases) {
    try {
      const res = path.startsWith("/api/client/")
        ? await clientFetch(base, path, { ...init, token })
        : await rawFetch(base, path, { ...init, token });
      const text = await res.text();
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      if (res.status === 401 && session?.refreshToken) {
        const refreshed = await refreshSession(session);
        if (refreshed) {
          return apiFetch(path, { ...init, session: refreshed, token: refreshed.apiToken });
        }
      }
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        if (typeof body === "object" && body) {
          const err = "error" in body ? String((body as { error: string }).error) : "";
          const detail =
            "message" in body ? String((body as { message: string }).message) : "";
          msg = detail || err || msg;
        }
        if (res.status === 401) {
          msg =
            "Not authorized — this phone’s pairing expired or no longer matches home. " +
            "On home Wi‑Fi: open the dashboard Pairing QR and re-pair, then try Chat again.";
        }
        throw new ApiError(msg, res.status, body);
      }
      rememberBase(base);
      return body as T;
    } catch (e) {
      lastErr = e;
      if (e instanceof ApiError && e.status !== 0) throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("unreachable");
}

export async function redeemPairing(
  payload: PairPayload,
  opts: { deviceLabel: string; platform: string },
): Promise<Session> {
  const base = payload.lan_api_base;
  if (!base) {
    throw new Error("Pair QR missing lan_api_base — regenerate QR on the home dashboard");
  }
  const bodyJson = JSON.stringify({
    code: payload.code,
    pair_secret: payload.pair_secret,
    device_label: opts.deviceLabel,
    platform: opts.platform,
  });
  let res: Response;
  try {
    res = await clientFetch(base, "/api/client/pair/redeem", {
      method: "POST",
      body: bodyJson,
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Cannot reach home at ${base} (${detail}). Phone must be on the same Wi‑Fi as AtleyOS.`,
    );
  }
  let body: Record<string, unknown>;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    throw new Error(`Home returned a non-JSON response (HTTP ${res.status})`);
  }
  if (!res.ok || !body.ok) {
    throw new ApiError(String(body.error || "pair_failed"), res.status, body);
  }
  const session: Session = {
    deviceId: String(body.device_id),
    apiToken: String(body.api_token),
    refreshToken: String(body.refresh_token),
    lanApiBase: String(body.lan_api_base || payload.lan_api_base),
    overlayApiBase: String(body.overlay_api_base || payload.overlay_api_base || ""),
    httpsApiBase: String(
      body.https_api_base || payload.https_api_base || "",
    ),
    hostPublicKey: body.host_public_key ? String(body.host_public_key) : payload.host_public_key,
    pin: body.pin ? String(body.pin) : payload.pin,
    overlayIp: body.overlay_ip ? String(body.overlay_ip) : undefined,
    wgClientConf: (body.wg_client_conf as string) || null,
    relayUrl: body.relay_url ? String(body.relay_url) : payload.relay_url,
    deviceLabel: opts.deviceLabel,
    platform: opts.platform,
    homeVpnAvailable: Boolean(body.home_vpn_available ?? payload.home_vpn_available),
    profileContinuity: Boolean(body.profile_continuity ?? payload.profile_continuity),
    productModel: String(body.product_model || payload.product_model || "https_first_vpn_optional"),
  };
  await saveSession(session);
  return session;
}

async function refreshSession(session: Session): Promise<Session | null> {
  for (const base of await orderedBases(session)) {
    try {
      const res = await clientFetch(base, "/api/client/session/refresh", {
        method: "POST",
        body: JSON.stringify({ refresh_token: session.refreshToken }),
      });
      const body = (await res.json()) as Record<string, unknown>;
      if (!res.ok || !body.ok) continue;
      const next = await updateSession({
        apiToken: String(body.api_token),
        refreshToken: String(body.refresh_token),
      });
      return next;
    } catch {
      /* try next base */
    }
  }
  return null;
}

export async function clientStatus() {
  const body = await apiFetch<{
    ok: boolean;
    reachable: boolean;
    device: Record<string, unknown>;
    remote_access: Record<string, unknown>;
    https_api_base?: string;
    profile_continuity?: boolean;
    product_model?: string;
  }>("/api/client/status");
  // Pick up Away URL if Owner enabled it after the last pair (no re-pair required
  // when the phone can still reach home on LAN/HTTPS).
  const session = await loadSession();
  if (session) {
    const https = String(
      body.https_api_base ||
        (body.remote_access as { https_api_base?: string } | undefined)
          ?.https_api_base ||
        "",
    ).trim();
    const patch: Partial<Session> = {};
    if (https.startsWith("https://") && https !== session.httpsApiBase) {
      patch.httpsApiBase = https;
    }
    if (
      typeof body.profile_continuity === "boolean" &&
      body.profile_continuity !== session.profileContinuity
    ) {
      patch.profileContinuity = body.profile_continuity;
    }
    if (Object.keys(patch).length) {
      await updateSession(patch);
    }
  }
  return body;
}

/** Probe which API base answers (HTTPS away / LAN / optional Home VPN overlay). */
export async function probeReachability(session?: Session | null): Promise<{
  ok: boolean;
  base?: string;
  mode?: "https" | "lan" | "overlay";
  error?: string;
}> {
  const s = session === undefined ? await loadSession() : session;
  if (!s) return { ok: false, error: "not_paired" };
  for (const base of await pickReachableBase(s, s.apiToken)) {
    try {
      const res = await clientFetch(base, "/api/client/status", {
        token: s.apiToken,
        timeoutMs: 2500,
      });
      if (!res.ok) continue;
      const mode: "https" | "lan" | "overlay" =
        base === s.httpsApiBase
          ? "https"
          : base === s.lanApiBase
            ? "lan"
            : "overlay";
      return { ok: true, base, mode };
    } catch {
      /* try next */
    }
  }
  const wifi = await onHomeWifi();
  if (!wifi && !s.httpsApiBase) {
    return {
      ok: false,
      error:
        "Away HTTPS is not set on this phone. On home Wi‑Fi: enable Away access on the dashboard, then re-pair (or open Chat once on Wi‑Fi to sync).",
    };
  }
  return {
    ok: false,
    error:
      "Home API unreachable. On Wi‑Fi check AtleyOS is running; away from home use Away HTTPS (Home VPN is optional).",
  };
}

export async function ingestObservation(items: unknown[]) {
  return apiFetch<{ ok: boolean; accepted: number }>("/api/client/observation", {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

/** Profile Continuity Channel — Observation over HTTPS when Owner enabled PCC. */
export async function ingestProfileContinuity(
  items: unknown[],
  collector = "atleyos_client",
) {
  return apiFetch<{ ok: boolean; accepted: number; channel?: string }>(
    "/api/client/profile/ingest",
    {
      method: "POST",
      body: JSON.stringify({ items, collector }),
    },
  );
}

export async function postEndpoint(endpoint: string) {
  return apiFetch("/api/client/endpoint", {
    method: "POST",
    body: JSON.stringify({ endpoint }),
  });
}

export async function revokeSelf() {
  return apiFetch("/api/client/revoke-self", { method: "POST", body: "{}" });
}

export async function homeOpeners() {
  return apiFetch<{ ok: boolean; apps: HomeApp[] }>("/api/client/home-openers");
}

export async function chatCompletions(
  messages: { role: string; content: string }[],
  opts?: { stream?: boolean },
): Promise<{ content: string }> {
  const session = await loadSession();
  if (!session) throw new Error("not_paired");
  const body = {
    model: "atleyos",
    messages,
    stream: false,
    ...opts,
  };
  const out = await apiFetch<{
    choices?: { message?: { content?: string } }[];
  }>("/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const content = out?.choices?.[0]?.message?.content ?? "";
  return { content };
}

export async function listConversations() {
  return apiFetch<{ ok: boolean; conversations?: unknown[] }>(
    "/api/client/conversations",
  );
}

export function parsePairPayload(raw: string): PairPayload {
  const text = raw.trim();
  if (text.startsWith("atleyos://pair")) {
    const url = new URL(text);
    const data = url.searchParams.get("data");
    if (!data) throw new Error("missing_pair_data");
    return JSON.parse(decodeURIComponent(data)) as PairPayload;
  }
  const parsed = JSON.parse(text) as PairPayload;
  const kindOk =
    parsed.kind === "client_pair" || parsed.kind === "mobile_pair";
  if (parsed.product !== "atleyos" || !kindOk) {
    throw new Error("not_atleyos_pair");
  }
  const expiresSec =
    parsed.expires_at > 1e12 ? parsed.expires_at / 1000 : parsed.expires_at;
  if (expiresSec < Date.now() / 1000) {
    throw new Error("pairing_expired");
  }
  return parsed;
}
