import { isLoopbackClientBase } from "./apiBases";
import { isPasswordsRow } from "./passwords";

/**
 * Photos / Files / Media / Home links for the phone.
 * Prefer addresses the home server sent. When it didn’t, use the standard
 * ports on the saved LAN host (HOST_E2E_HANDOFF). Never invent 127.0.0.1.
 */

export type HomeKind = "photos" | "files" | "media" | "home" | "other";

export type HomeAppLike = {
  id?: string;
  title?: string;
  app?: string;
  native_schemes?: string[];
  store?: { ios?: string; android?: string };
  overlay_url?: string;
  lan_url?: string;
  https_url?: string;
  away_url?: string;
  public_url?: string;
  status?: string;
  healthy?: boolean;
  up?: boolean;
  state?: string;
};

export type HomeLink = {
  kind: HomeKind;
  title: string;
  app: string;
  lanUrl: string;
  awayUrl: string;
  overlayUrl: string;
  status: string | null;
  fromServer: boolean;
  nativeSchemes: string[];
  store?: { ios?: string; android?: string };
  openUrl: string;
  openMode: "lan" | "away" | "overlay" | "none";
  openNote: string;
};

const STANDARD: Array<{ kind: Exclude<HomeKind, "other">; title: string; app: string; port: number }> = [
  { kind: "photos", title: "Photos", app: "immich", port: 2283 },
  { kind: "files", title: "Files", app: "nextcloud", port: 10081 },
  { kind: "media", title: "Media", app: "jellyfin", port: 8097 },
  { kind: "home", title: "Home", app: "home_assistant", port: 8123 },
];

export function classifyHomeApp(input: { id?: string; title?: string; app?: string }): HomeKind {
  const blob = `${input.id || ""} ${input.title || ""} ${input.app || ""}`.toLowerCase();
  if (/immich|photo/.test(blob)) return "photos";
  if (/nextcloud|owncloud|\bfiles?\b/.test(blob)) return "files";
  if (/jellyfin|emby|plex|\bmedia\b/.test(blob)) return "media";
  if (/home.?assistant|homeassistant|\bhass\b/.test(blob)) return "home";
  return "other";
}

export function hostFromApiBase(base: string | undefined | null): string {
  const raw = String(base || "").trim();
  if (!raw || isLoopbackClientBase(raw)) return "";
  try {
    const host = new URL(raw).hostname.replace(/^\[|\]$/g, "");
    if (!host || isLoopbackClientBase(`http://${host}`)) return "";
    return host;
  } catch {
    return "";
  }
}

function cleanUrl(value: unknown): string {
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

function readStatus(app: HomeAppLike): string | null {
  if (typeof app.status === "string" && app.status.trim()) return app.status.trim();
  if (typeof app.state === "string" && app.state.trim()) return app.state.trim();
  if (app.healthy === true || app.up === true) return "up";
  if (app.healthy === false || app.up === false) return "down";
  return null;
}

function statusLine(status: string | null, fromServer: boolean): string {
  if (status) return `Status: ${status}`;
  if (fromServer) return "Home didn’t report whether this app is up.";
  return "Standard port on your saved LAN address. Home didn’t report status.";
}

export function presentHomeLinks(input: {
  apps?: HomeAppLike[] | null;
  lanApiBase?: string | null;
  /** Saved client API Away host. An app https_url on this host is dropped. */
  httpsApiBase?: string | null;
  onWifi: boolean;
  homeVpnUp?: boolean;
}): HomeLink[] {
  const byKind = new Map<HomeKind, HomeDraft>();
  const extras: HomeDraft[] = [];

  const blocked = blockedAppHosts(input.httpsApiBase);
  for (const app of input.apps || []) {
    // Passwords opens https_url or server_url, never LAN or overlay.
    if (isPasswordsRow(app)) continue;
    const kind = classifyHomeApp(app);
    const link = draftFromApp(app, kind, blocked);
    if (kind === "other") {
      extras.push(link);
      continue;
    }
    const prev = byKind.get(kind);
    if (!prev || link.fromServer) byKind.set(kind, link);
  }

  const host = hostFromApiBase(input.lanApiBase);
  for (const spec of STANDARD) {
    const lanUrl = host ? `http://${host}:${spec.port}` : "";
    const existing = byKind.get(spec.kind);
    if (!existing) {
      byKind.set(spec.kind, {
        kind: spec.kind,
        title: spec.title,
        app: spec.app,
        lanUrl,
        lanSpecified: false,
        awayUrl: "",
        overlayUrl: "",
        status: null,
        fromServer: false,
        nativeSchemes: [],
      });
      continue;
    }
    // An explicit empty lan_url means home has no LAN address. An omitted
    // field (older server) may still use the standard port on the saved host.
    if (!existing.lanSpecified && !existing.lanUrl && lanUrl) {
      byKind.set(spec.kind, { ...existing, lanUrl });
    }
  }

  const ordered = STANDARD.map((spec) => byKind.get(spec.kind))
    .filter((link): link is HomeDraft => !!link)
    .map((link) => finish(link, input));
  return [...ordered, ...extras.map((link) => finish(link, input))];
}

type HomeDraft = Omit<HomeLink, "openUrl" | "openMode" | "openNote"> & {
  /** True when the server sent lan_url, including an explicit empty string. */
  lanSpecified: boolean;
};

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/** Client API host is never an app Away URL. `atleyos.atley.llc` is that API. */
function blockedAppHosts(httpsApiBase?: string | null): Set<string> {
  const hosts = new Set<string>(["atleyos.atley.llc"]);
  const saved = hostFromApiBase(httpsApiBase);
  if (saved) hosts.add(saved.toLowerCase());
  return hosts;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  } catch {
    return "";
  }
}

function appAwayUrl(value: unknown, blocked: Set<string>): string {
  const cleaned = cleanUrl(value);
  if (!cleaned || isLoopbackClientBase(cleaned)) return "";
  const host = hostnameOf(cleaned);
  if (!host || blocked.has(host)) return "";
  return cleaned;
}

function draftFromApp(app: HomeAppLike, kind: HomeKind, blocked: Set<string>): HomeDraft {
  const lanSpecified = hasOwn(app, "lan_url");
  const rawLan = lanSpecified ? cleanUrl(app.lan_url) : "";
  const loopbackLan = !!rawLan && isLoopbackClientBase(rawLan);
  const awayUrl =
    appAwayUrl(app.https_url, blocked) ||
    appAwayUrl(app.away_url, blocked) ||
    appAwayUrl(app.public_url, blocked);
  return {
    kind,
    title: (app.title || app.app || kind).trim() || kind,
    app: (app.app || kind).trim(),
    lanUrl: loopbackLan ? "" : rawLan,
    // Loopback is never a LAN address. Treat it as omitted so the saved host can fill in.
    lanSpecified: lanSpecified && !loopbackLan,
    awayUrl,
    overlayUrl: cleanUrl(app.overlay_url),
    status: readStatus(app),
    fromServer: true,
    nativeSchemes: (app.native_schemes || []).filter((s) => typeof s === "string" && s.trim()),
    store: app.store,
  };
}

function finish(
  partial: HomeDraft,
  input: { onWifi: boolean; homeVpnUp?: boolean },
): HomeLink {
  const { lanSpecified: _lanSpecified, ...link } = partial;
  const chosen = chooseUrl(link, input);
  return { ...link, ...chosen };
}

function chooseUrl(
  link: { lanUrl: string; awayUrl: string; overlayUrl: string },
  input: { onWifi: boolean; homeVpnUp?: boolean },
): Pick<HomeLink, "openUrl" | "openMode" | "openNote"> {
  if (input.onWifi && link.lanUrl) {
    return { openUrl: link.lanUrl, openMode: "lan", openNote: "Opens the LAN address on home Wi‑Fi." };
  }
  if (!input.onWifi && link.awayUrl) {
    return { openUrl: link.awayUrl, openMode: "away", openNote: "Opens the Away address." };
  }
  if (input.homeVpnUp && link.overlayUrl) {
    return { openUrl: link.overlayUrl, openMode: "overlay", openNote: "Opens the address on Home VPN." };
  }
  if (link.awayUrl) {
    return { openUrl: link.awayUrl, openMode: "away", openNote: "Opens the Away address." };
  }
  if (link.lanUrl) {
    return {
      openUrl: link.lanUrl,
      openMode: "lan",
      openNote: input.onWifi
        ? "Opens the LAN address on home Wi‑Fi."
        : "This is the home LAN address. It needs home Wi‑Fi, or Home VPN for the whole phone.",
    };
  }
  if (link.overlayUrl) {
    return {
      openUrl: link.overlayUrl,
      openMode: "overlay",
      openNote: "This address is on Home VPN. Turn Home VPN on in Settings to open it.",
    };
  }
  return { openUrl: "", openMode: "none", openNote: "Home didn’t send an address for this app." };
}

export function homeStatusLine(link: Pick<HomeLink, "status" | "fromServer">): string {
  return statusLine(link.status, link.fromServer);
}

export function findHomeLink(links: HomeLink[], kind: Exclude<HomeKind, "other">): HomeLink | undefined {
  return links.find((link) => link.kind === kind);
}
