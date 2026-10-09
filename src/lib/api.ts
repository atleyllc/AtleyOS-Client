import * as Network from "expo-network";
import {
  isLoopbackClientBase,
  normalizeClientApiBase,
  orderedApiBases,
  unpairedFallbackBases,
} from "./apiBases";
import { explainUnreachable, NotPairedError, UNPAIRED_MESSAGE } from "./connectionCopy";
import { sessionPatchFromStatus } from "./statusSync";
import type { HomeApp, PairPayload, Session } from "./types";
import { loadSession, saveSession, updateSession } from "./session";

export { normalizeClientApiBase } from "./apiBases";
export { NotPairedError, UNPAIRED_MESSAGE } from "./connectionCopy";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function sessionBases(session: Session): {
  https: string;
  overlay: string;
  lan: string;
} {
  return {
    https: normalizeClientApiBase(session.httpsApiBase),
    overlay: normalizeClientApiBase(session.overlayApiBase),
    lan: normalizeClientApiBase(session.lanApiBase),
  };
}

/** Physical phones must never call 127.0.0.1 (that address is the phone). */
let loopbackDecision: Promise<boolean> | null = null;

async function deviceAllowsLoopback(): Promise<boolean> {
  if (!loopbackDecision) {
    loopbackDecision = import("expo-device")
      .then((Device) => Device.isDevice === false)
      .catch(() => false);
  }
  return loopbackDecision;
}

function keepStoredBase(value: string, allowLoopback: boolean): string {
  if (value && !allowLoopback && isLoopbackClientBase(value)) return "";
  return value;
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
  const [vpnUp, wifi, allowLoopback] = await Promise.all([
    homeVpnTunnelUp(),
    onHomeWifi(),
    deviceAllowsLoopback(),
  ]);
  const all = orderedApiBases(session, {
    homeVpnUp: vpnUp,
    onWifi: wifi,
    allowLoopback,
    httpsReady: session.httpsReady,
  });
  const { lan, overlay } = sessionBases(session);
  // Away from Wi‑Fi: never prefer a cached LAN hop — it will hang Chat.
  if (!wifi) {
    if (
      preferredBase?.base &&
      (preferredBase.base === lan || preferredBase.base === overlay)
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
type PickedBases = { bases: string[]; probed: string[] };

async function pickReachableBase(
  session: Session,
  token?: string,
): Promise<PickedBases> {
  const ordered = await orderedBases(session);
  if (ordered.length <= 1) return { bases: ordered, probed: ordered };
  const wifi = await onHomeWifi();
  const { lan, overlay } = sessionBases(session);
  // Probe in parallel; keep preference order from orderedBases.
  // Only bases that authenticate (2xx) count — a 401 from a stale LAN/VPN hop
  // is "reachable" TCP-wise but must not win Chat (that was the Away Auth-failed bug).
  const settled = await Promise.all(
    ordered.map(async (base) => {
      try {
        const res = await clientFetch(base, "/api/client/status", {
          token,
          // LAN/overlay often black-hole on cellular — fail fast off Wi‑Fi.
          timeoutMs:
            !wifi && (base === lan || base === overlay) ? 1200 : 2500,
        });
        return res.ok ? base : null;
      } catch {
        return null;
      }
    }),
  );
  const winners = ordered.filter((b) => settled.includes(b));
  if (winners.length) {
    rememberBase(winners[0]);
    // Chat must not fall through to 180s timeouts on dead hops.
    return { bases: winners, probed: ordered };
  }
  // No authed probe winner: fail fast (especially off Wi‑Fi) instead of hanging Chat.
  if (!wifi) return { bases: [], probed: ordered };
  // On Wi‑Fi, try the first ordered base once (usually HTTPS, then LAN).
  return { bases: ordered.slice(0, 1), probed: ordered };
}

async function failureFor(session: Session, tried: string[]): Promise<Error> {
  const [wifi, allowLoopback] = await Promise.all([
    onHomeWifi(),
    deviceAllowsLoopback(),
  ]);
  const bases = sessionBases(session);
  return new Error(
    explainUnreachable({
      onWifi: wifi,
      allowLoopback,
      https: bases.https,
      lan: bases.lan,
      overlay: bases.overlay,
      tried,
      httpsReady: session.httpsReady,
    }).message,
  );
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
  init: RequestInit & { token?: string; session?: Session | null; refreshed?: boolean } = {},
): Promise<T> {
  const session = init.session === undefined ? await loadSession() : init.session;
  const token = init.token ?? session?.apiToken;
  const isChat = path.includes("/v1/chat/completions");
  let probed: string[] = [];
  let tryBases: string[];
  if (!session) {
    tryBases = unpairedFallbackBases(await deviceAllowsLoopback());
    probed = tryBases;
    if (!tryBases.length) throw new NotPairedError(UNPAIRED_MESSAGE);
  } else if (isChat) {
    const picked = await pickReachableBase(session, token);
    tryBases = picked.bases;
    probed = picked.probed;
  } else {
    tryBases = await orderedBases(session);
    probed = tryBases;
  }
  if (session && tryBases.length === 0) {
    throw await failureFor(session, probed);
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
      if (res.status === 401 && session?.refreshToken && !init.refreshed) {
        const refreshed = await refreshSession(session);
        if (refreshed) {
          return apiFetch(path, {
            ...init,
            session: refreshed,
            token: refreshed.apiToken,
            refreshed: true,
          });
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
            "Auth failed — stale pair from an older home setup. On home Wi‑Fi: " +
            "Settings → Remote Access → Show pair QR, then re-pair this phone and try Chat again.";
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
  if (session) throw await failureFor(session, probed.length ? probed : tryBases);
  throw lastErr instanceof Error ? lastErr : new Error("unreachable");
}

export async function redeemPairing(
  payload: PairPayload,
  opts: { deviceLabel: string; platform: string },
): Promise<Session> {
  const base = normalizeClientApiBase(payload.lan_api_base);
  const allowLoopback = await deviceAllowsLoopback();
  if (base && isLoopbackClientBase(base) && !allowLoopback) {
    throw new Error(
      `This pair QR uses ${base}, which is this phone. On the home dashboard open Remote Access → Show pair QR again so the phone gets the server’s LAN address.`,
    );
  }
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
    lanApiBase: keepStoredBase(
      normalizeClientApiBase(String(body.lan_api_base || payload.lan_api_base)) || base,
      allowLoopback,
    ),
    overlayApiBase: keepStoredBase(
      normalizeClientApiBase(String(body.overlay_api_base || payload.overlay_api_base || "")),
      allowLoopback,
    ),
    httpsApiBase: keepStoredBase(
      normalizeClientApiBase(String(body.https_api_base || payload.https_api_base || "")),
      allowLoopback,
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
    httpsReady:
      typeof body.https_ready === "boolean"
        ? body.https_ready
        : typeof body.away_https_ready === "boolean"
          ? body.away_https_ready
          : undefined,
  };
  await saveSession(session);
  clearPreferredBase();
  return session;
}

/** One refresh at a time — parallel 401s must not rotate the refresh token twice. */
let refreshInFlight: Promise<Session | null> | null = null;

async function refreshSession(session: Session): Promise<Session | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    // Prefer bases that already accept this device; never refresh via a 401 hop.
    const picked = await pickReachableBase(session, session.apiToken);
    const bases = picked.bases.length ? picked.bases : await orderedBases(session);
    for (const base of bases) {
      try {
        const res = await clientFetch(base, "/api/client/session/refresh", {
          method: "POST",
          body: JSON.stringify({ refresh_token: session.refreshToken }),
        });
        const body = (await res.json()) as Record<string, unknown>;
        if (!res.ok || !body.ok) continue;
        return await updateSession({
          apiToken: String(body.api_token),
          refreshToken: String(body.refresh_token),
        });
      } catch {
        /* try next base */
      }
    }
    return null;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export async function clientStatus() {
  const body = await apiFetch<{
    ok: boolean;
    reachable: boolean;
    device: Record<string, unknown>;
    remote_access: Record<string, unknown>;
    https_api_base?: string;
    lan_api_base?: string;
    profile_continuity?: boolean;
    product_model?: string;
  }>("/api/client/status");
  // Sync Away + LAN bases from home (fixes :8080 / stale tunnel leftovers).
  // Explicit empty https_api_base clears Away. https_ready false keeps the URL
  // for the error text but stops dialing it until the tunnel is up.
  // Loopback addresses from the host are not stored on a phone.
  const session = await loadSession();
  if (session) {
    const patch = sessionPatchFromStatus(session, body as Record<string, unknown>, {
      allowLoopback: await deviceAllowsLoopback(),
    });
    if (Object.keys(patch).length) {
      await updateSession(patch);
      clearPreferredBase();
    }
  }
  return body;
}

export type Reachability =
  | { ok: true; base: string; mode: "https" | "lan" | "overlay" }
  | { ok: false; reason: "not_paired"; message: string }
  | { ok: false; reason: "unreachable"; message: string; suggestPair: boolean };

/** Probe which API base answers (HTTPS away / LAN / optional Home VPN overlay). */
export async function probeReachability(session?: Session | null): Promise<Reachability> {
  const s = session === undefined ? await loadSession() : session;
  if (!s) return { ok: false, reason: "not_paired", message: UNPAIRED_MESSAGE };
  const { https, lan } = sessionBases(s);
  const picked = await pickReachableBase(s, s.apiToken);
  for (const base of picked.bases) {
    try {
      const res = await clientFetch(base, "/api/client/status", {
        token: s.apiToken,
        timeoutMs: 2500,
      });
      if (!res.ok) continue;
      const mode: "https" | "lan" | "overlay" =
        base === https ? "https" : base === lan ? "lan" : "overlay";
      return { ok: true, base, mode };
    } catch {
      /* try next */
    }
  }
  const [wifi, allowLoopback] = await Promise.all([onHomeWifi(), deviceAllowsLoopback()]);
  const bases = sessionBases(s);
  const explained = explainUnreachable({
    onWifi: wifi,
    allowLoopback,
    https: bases.https,
    lan: bases.lan,
    overlay: bases.overlay,
    tried: picked.probed,
    httpsReady: s.httpsReady,
  });
  return {
    ok: false,
    reason: "unreachable",
    message: explained.message,
    suggestPair: explained.suggestPair,
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
  if (!session) throw new NotPairedError(UNPAIRED_MESSAGE);
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
