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

function bases(session: Session): string[] {
  const list = [session.overlayApiBase, session.lanApiBase].filter(Boolean);
  return [...new Set(list)];
}

async function rawFetch(
  base: string,
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (init.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (init.token) {
    headers.Authorization = `Bearer ${init.token}`;
  }
  return fetch(`${base.replace(/\/$/, "")}${path}`, {
    ...init,
    headers,
  });
}

/** Prefer /api/client/*; fall back to legacy /api/mobile/* on older hosts. */
async function clientFetch(
  base: string,
  clientPath: string,
  init: RequestInit & { token?: string } = {},
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
  const tryBases = session ? bases(session) : ["http://127.0.0.1:8765"];
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
        throw new ApiError(
          typeof body === "object" && body && "error" in body
            ? String((body as { error: string }).error)
            : `HTTP ${res.status}`,
          res.status,
          body,
        );
      }
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
  const bodyJson = JSON.stringify({
    code: payload.code,
    pair_secret: payload.pair_secret,
    device_label: opts.deviceLabel,
    platform: opts.platform,
  });
  const res = await clientFetch(base, "/api/client/pair/redeem", {
    method: "POST",
    body: bodyJson,
  });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok || !body.ok) {
    throw new ApiError(String(body.error || "pair_failed"), res.status, body);
  }
  const session: Session = {
    deviceId: String(body.device_id),
    apiToken: String(body.api_token),
    refreshToken: String(body.refresh_token),
    lanApiBase: String(body.lan_api_base || payload.lan_api_base),
    overlayApiBase: String(body.overlay_api_base || payload.overlay_api_base || ""),
    hostPublicKey: body.host_public_key ? String(body.host_public_key) : payload.host_public_key,
    pin: body.pin ? String(body.pin) : payload.pin,
    overlayIp: body.overlay_ip ? String(body.overlay_ip) : undefined,
    wgClientConf: (body.wg_client_conf as string) || null,
    relayUrl: body.relay_url ? String(body.relay_url) : payload.relay_url,
    deviceLabel: opts.deviceLabel,
    platform: opts.platform,
  };
  await saveSession(session);
  return session;
}

async function refreshSession(session: Session): Promise<Session | null> {
  for (const base of bases(session)) {
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
  return apiFetch<{
    ok: boolean;
    reachable: boolean;
    device: Record<string, unknown>;
    remote_access: Record<string, unknown>;
  }>("/api/client/status");
}

export async function ingestObservation(items: unknown[]) {
  return apiFetch<{ ok: boolean; accepted: number }>("/api/client/observation", {
    method: "POST",
    body: JSON.stringify({ items }),
  });
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
