import { isLoopbackClientBase, normalizeClientApiBase } from "./apiBases";
import type { Session } from "./types";

type StatusShape = Pick<
  Session,
  "httpsApiBase" | "lanApiBase" | "httpsReady" | "profileContinuity"
>;

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function readAdvertised(
  body: Record<string, unknown>,
  key: "https_api_base" | "lan_api_base",
): { present: boolean; value: string } {
  if (hasOwn(body, key)) {
    return {
      present: true,
      value: normalizeClientApiBase(body[key] == null ? "" : String(body[key])),
    };
  }
  const ra = body.remote_access;
  if (ra && typeof ra === "object" && !Array.isArray(ra) && hasOwn(ra, key)) {
    const raw = (ra as Record<string, unknown>)[key];
    return {
      present: true,
      value: normalizeClientApiBase(raw == null ? "" : String(raw)),
    };
  }
  return { present: false, value: "" };
}

/**
 * Host marks Away HTTPS ready only when the tunnel is up.
 * `away_ready` on the WireGuard path is a different flag and is ignored here.
 */
export function readHttpsReady(body: Record<string, unknown>): boolean | undefined {
  const ra = body.remote_access;
  const raObj =
    ra && typeof ra === "object" && !Array.isArray(ra)
      ? (ra as Record<string, unknown>)
      : undefined;
  const https = raObj?.https;
  const httpsObj =
    https && typeof https === "object" && !Array.isArray(https)
      ? (https as Record<string, unknown>)
      : undefined;
  const away = raObj?.away_path;
  const awayObj =
    away && typeof away === "object" && !Array.isArray(away)
      ? (away as Record<string, unknown>)
      : undefined;
  const candidates = [
    body.https_ready,
    body.away_https_ready,
    raObj?.https_ready,
    raObj?.away_https_ready,
    httpsObj?.ready,
    awayObj?.https_ready,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "boolean") return candidate;
  }
  return undefined;
}

/**
 * Apply a /api/client/status payload onto the saved session.
 * An explicit empty https_api_base clears Away. A missing key keeps the saved URL.
 * Loopback addresses are not written on a real device.
 */
export function sessionPatchFromStatus(
  session: StatusShape,
  body: Record<string, unknown> | null | undefined,
  opts: { allowLoopback: boolean },
): Partial<Session> {
  const patch: Partial<Session> = {};
  if (!body) return patch;

  const ready = readHttpsReady(body);
  if (typeof ready === "boolean" && ready !== session.httpsReady) {
    patch.httpsReady = ready;
  }

  const https = readAdvertised(body, "https_api_base");
  if (https.present) {
    const reject =
      !opts.allowLoopback && !!https.value && isLoopbackClientBase(https.value);
    if (!reject && https.value !== normalizeClientApiBase(session.httpsApiBase)) {
      patch.httpsApiBase = https.value;
    }
  } else if (
    session.httpsApiBase &&
    !normalizeClientApiBase(session.httpsApiBase)
  ) {
    patch.httpsApiBase = "";
  }

  const lan = readAdvertised(body, "lan_api_base");
  if (lan.present && lan.value) {
    const reject = !opts.allowLoopback && isLoopbackClientBase(lan.value);
    if (!reject && lan.value !== normalizeClientApiBase(session.lanApiBase)) {
      patch.lanApiBase = lan.value;
    }
  }

  if (
    typeof body.profile_continuity === "boolean" &&
    body.profile_continuity !== session.profileContinuity
  ) {
    patch.profileContinuity = body.profile_continuity;
  }

  return patch;
}
