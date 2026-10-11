/**
 * Away apps: Photos, Files, Media, and Home away from home.
 *
 * Those apps stay off the Cloudflare link (video and big uploads don't belong
 * there). The phone reaches them over the AtleyOS VPN instead. The tunnel
 * routes only the AtleyOS overlay and the home server's own address, so the
 * address that works on home Wi‑Fi also works away, and the rest of the
 * phone's traffic never touches it.
 */
import { arr, bool, num, rec, str } from "./parse";

export const OVERLAY_CIDR = "10.55.0.0/24";

export type AwayAppRow = {
  id: string;
  title: string;
  appName: string;
  androidPackage: string;
  iosScheme: string;
  store: { ios?: string; android?: string };
  serverUrl: string;
  serverHint: string;
};

export type AwayAppsStatus = {
  supported: boolean;
  summary: string;
  connected: boolean;
  handshakeAgeSec: number | null;
  homeReady: boolean;
  endpoint: string;
  allowedIps: string;
  lanIp: string;
  firewallOk: boolean;
  firewallCommands: string[];
  routerOk: boolean;
  routerInstructions: string;
  routerRule: { protocol: string; externalPort: number; internalIp: string; internalPort: number } | null;
  apps: AwayAppRow[];
};

export const UNSUPPORTED: AwayAppsStatus = {
  supported: false,
  summary: "Your home server needs an update for Away apps.",
  connected: false,
  handshakeAgeSec: null,
  homeReady: false,
  endpoint: "",
  allowedIps: OVERLAY_CIDR,
  lanIp: "",
  firewallOk: false,
  firewallCommands: [],
  routerOk: false,
  routerInstructions: "",
  routerRule: null,
  apps: [],
};

export function parseAwayApps(raw: unknown): AwayAppsStatus {
  const r = rec(raw);
  if (!r || r.ok !== true) return UNSUPPORTED;
  const fw = rec(r.firewall) || {};
  const router = rec(r.router) || {};
  const apps: AwayAppRow[] = [];
  for (const item of arr(r.apps)) {
    const a = rec(item);
    if (!a) continue;
    const serverUrl = str(a.server_url);
    if (!serverUrl) continue;
    const store = rec(a.store) || {};
    apps.push({
      id: str(a.id),
      title: str(a.title) || str(a.id),
      appName: str(a.app_name) || str(a.title),
      androidPackage: str(a.android_package),
      iosScheme: str(a.ios_scheme),
      store: { ios: str(store.ios) || undefined, android: str(store.android) || undefined },
      serverUrl,
      serverHint: str(a.server_hint) || "Server address",
    });
  }
  const age = num(r.handshake_age_sec);
  const routerOk = bool(router.ok);
  return {
    supported: true,
    summary: str(r.summary),
    connected: bool(r.connected),
    handshakeAgeSec: age,
    homeReady: bool(r.home_ready),
    endpoint: str(r.endpoint),
    allowedIps: str(r.allowed_ips) || OVERLAY_CIDR,
    lanIp: str(r.lan_ip),
    firewallOk: bool(fw.ok),
    firewallCommands: arr(fw.commands).map((c) => String(c)),
    routerOk,
    routerInstructions: str(router.instructions),
    routerRule: routerOk
      ? null
      : {
          protocol: str(router.protocol) || "UDP",
          externalPort: num(router.external_port) ?? 51820,
          internalIp: str(router.internal_ip),
          internalPort: num(router.internal_port) ?? 51820,
        },
    apps,
  };
}

/** AllowedIPs for the phone: overlay + the home server's LAN address. Never 0.0.0.0/0. */
export function splitTunnelIps(lanHost: string): string[] {
  const out = [OVERLAY_CIDR];
  const host = (lanHost || "").trim();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) && !host.startsWith("127.")) out.push(`${host}/32`);
  return out;
}

/** Rewrite AllowedIPs (and Endpoint, when known) in a WireGuard conf. */
export function withSplitTunnel(conf: string, lanHost: string, endpoint?: string): string {
  const ips = splitTunnelIps(lanHost).join(", ");
  let next = /^AllowedIPs\s*=.*$/im.test(conf)
    ? conf.replace(/^AllowedIPs\s*=.*$/gim, `AllowedIPs = ${ips}`)
    : conf.replace(/^\[Peer\]\s*$/im, `[Peer]\nAllowedIPs = ${ips}`);
  const ep = (endpoint || "").trim();
  if (ep && /^[\w.-]+:\d+$/.test(ep)) next = next.replace(/^Endpoint\s*=.*$/gim, `Endpoint = ${ep}`);
  return next;
}

export function confPrivateKey(conf: string | null | undefined): string {
  const m = String(conf || "").match(/^PrivateKey\s*=\s*(.+)$/im);
  return m ? m[1].trim() : "";
}

/**
 * Which conf to use. A re-pair writes a new key into the session; an older
 * stored conf with another key would never handshake.
 */
export function pickConf(stored: string | null, fromSession: string | null | undefined): string | null {
  if (fromSession && confPrivateKey(fromSession) && confPrivateKey(stored) !== confPrivateKey(fromSession)) {
    return fromSession;
  }
  return stored || fromSession || null;
}

export type OpenTarget = "native" | "browser";

export type OpenPlan =
  | { kind: "native"; androidPackage: string; iosScheme: string; url: string }
  | { kind: "browser"; url: string }
  | { kind: "setup"; reason: string }
  | { kind: "none"; reason: string };

/**
 * What a Home tile does.
 * At home, or away with the VPN up, the home address works: open the app if
 * it's installed and preferred, else the browser. Away without the VPN, the
 * home address can't work, so send the Owner to Away apps instead of a dead
 * local IP.
 */
export function planOpen(input: {
  url: string;
  atHome: boolean;
  vpnUp: boolean;
  installed: boolean;
  prefer: OpenTarget;
  androidPackage?: string;
  iosScheme?: string;
}): OpenPlan {
  if (!input.url) return { kind: "none", reason: "Home didn’t send an address for this app." };
  if (!input.atHome && !input.vpnUp) {
    return { kind: "setup", reason: "Away, this app needs Away apps turned on." };
  }
  if (input.installed && input.prefer === "native") {
    return {
      kind: "native",
      androidPackage: input.androidPackage || "",
      iosScheme: input.iosScheme || "",
      url: input.url,
    };
  }
  return { kind: "browser", url: input.url };
}

export function awayChip(input: { atHome: boolean | null; vpnUp: boolean; enabled: boolean }): {
  label: string;
  tone: "ok" | "accent" | "muted" | "warn";
} | null {
  if (input.atHome == null) return null;
  if (input.atHome) return { label: "Home Wi‑Fi", tone: "ok" };
  if (input.vpnUp) return { label: "Away · apps on", tone: "ok" };
  if (input.enabled) return { label: "Away · connecting", tone: "accent" };
  return { label: "Away · apps off", tone: "warn" };
}
