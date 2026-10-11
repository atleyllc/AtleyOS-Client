/**
 * Passwords tile from GET /api/client/home-openers, row id "passwords".
 * Open https_url, or server_url when https_url is missing.
 * lan_url and overlay_url are ignored even when the server sends them.
 */

export const BITWARDEN_SCHEME = "bitwarden://";
export const BITWARDEN_IOS_STORE = "https://apps.apple.com/app/id1137397744";
export const BITWARDEN_ANDROID_STORE =
  "https://play.google.com/store/apps/details?id=com.x8bit.bitwarden";

export type PasswordRow = {
  present: boolean;
  title: string;
  serverUrl: string;
  nativeScheme: string;
  store: { ios: string; android: string };
};

export function isPasswordsRow(app: { id?: string; app?: string }): boolean {
  const id = String(app.id || "").trim().toLowerCase();
  const name = String(app.app || "").trim().toLowerCase();
  return id === "passwords" || name === "vaultwarden" || name === "bitwarden";
}

function httpUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

/** https_url wins. server_url is the fallback. LAN and overlay are never used. */
export function passwordServerUrl(app: {
  https_url?: unknown;
  server_url?: unknown;
  lan_url?: unknown;
  overlay_url?: unknown;
}): string {
  return httpUrl(app.https_url) || httpUrl(app.server_url);
}

export function passwordRowFromApps(apps: unknown): PasswordRow {
  const list = Array.isArray(apps) ? apps : [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const app = item as { id?: string; app?: string; title?: string };
    if (!isPasswordsRow(app)) continue;
    return {
      present: true,
      title: (app.title || "Passwords").trim() || "Passwords",
      serverUrl: passwordServerUrl(app as { https_url?: unknown; server_url?: unknown }),
      nativeScheme: BITWARDEN_SCHEME,
      store: { ios: BITWARDEN_IOS_STORE, android: BITWARDEN_ANDROID_STORE },
    };
  }
  return {
    present: false,
    title: "Passwords",
    serverUrl: "",
    nativeScheme: BITWARDEN_SCHEME,
    store: { ios: BITWARDEN_IOS_STORE, android: BITWARDEN_ANDROID_STORE },
  };
}

export function storeUrlForPlatform(platform: string): string {
  return platform === "ios" ? BITWARDEN_IOS_STORE : BITWARDEN_ANDROID_STORE;
}

/** Native Bitwarden when it is installed. Otherwise the https/server URL. */
export function choosePasswordOpen(input: {
  serverUrl: string;
  nativeInstalled: boolean;
}): { mode: "native" | "https" | "none"; url: string } {
  if (input.nativeInstalled) return { mode: "native", url: BITWARDEN_SCHEME };
  if (input.serverUrl) return { mode: "https", url: input.serverUrl };
  return { mode: "none", url: "" };
}
