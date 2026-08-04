/**
 * WireGuard remote access — native VpnService on Android APK builds.
 *
 * Product rule: after pair, the tunnel stays up automatically. Users do not
 * toggle VPN when leaving the house. Split-tunnel only the AtleyOS overlay.
 */

import * as SecureStore from "expo-secure-store";
import { AppState, NativeModules, Platform } from "react-native";
import { loadSession } from "./session";
import { postEndpoint } from "./api";

const CONF_KEY = "atleyos.client.wg.conf.v1";
const STATE_KEY = "atleyos.client.wg.state.v1";
const PAUSED_KEY = "atleyos.client.wg.paused.v1";

export type TunnelState = {
  status: "down" | "config_ready" | "up" | "error" | "needs_permission";
  mode: "lan" | "overlay" | "relay" | "unknown";
  message?: string;
  relayUrl?: string;
  updatedAt: number;
};

type WgConfig = {
  privateKey: string;
  publicKey: string;
  serverAddress: string;
  serverPort: number;
  address: string;
  allowedIPs: string[];
  /** Omit on purpose — VPN DNS breaks phone internet when the tunnel is stale. */
  dns?: string[];
  mtu?: number;
};

type NativeWireGuard = {
  initialize(): Promise<void>;
  connect(config: WgConfig): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): Promise<{
    isConnected: boolean;
    tunnelState: string;
    status: string;
    error?: string;
  }>;
  isSupported(): Promise<boolean>;
};

let initPromise: Promise<void> | null = null;
let connectInFlight: Promise<TunnelState> | null = null;

function getNativeWg(): NativeWireGuard | null {
  if (Platform.OS !== "android") return null;
  const mod = NativeModules.WireGuardVpnModule as NativeWireGuard | undefined;
  return mod ?? null;
}

function loadPatchedModule(): NativeWireGuard | null {
  if (Platform.OS !== "android") return null;
  try {
    // Prefer package default export when linked
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require("react-native-wireguard-vpn-patched");
    return (pkg.default || pkg) as NativeWireGuard;
  } catch {
    return getNativeWg();
  }
}

export async function saveWgConf(conf: string | null | undefined): Promise<void> {
  if (!conf) return;
  await SecureStore.setItemAsync(CONF_KEY, conf);
}

export async function loadWgConf(): Promise<string | null> {
  return SecureStore.getItemAsync(CONF_KEY);
}

export async function getTunnelState(): Promise<TunnelState> {
  try {
    const raw = await SecureStore.getItemAsync(STATE_KEY);
    if (raw) return JSON.parse(raw) as TunnelState;
  } catch {
    /* ignore */
  }
  return {
    status: "down",
    mode: "unknown",
    updatedAt: Date.now(),
  };
}

async function setTunnelState(state: TunnelState): Promise<void> {
  await SecureStore.setItemAsync(STATE_KEY, JSON.stringify(state));
}

function parseConfLine(conf: string, key: string): string | null {
  const re = new RegExp(`^${key}\\s*=\\s*(.+)$`, "im");
  const m = conf.match(re);
  return m ? m[1].trim() : null;
}

/** Parse AtleyOS client .conf into native connect() args. */
export function parseWgConf(conf: string): WgConfig {
  const privateKey = parseConfLine(conf, "PrivateKey");
  const publicKey = parseConfLine(conf, "PublicKey");
  const address = parseConfLine(conf, "Address");
  const endpoint = parseConfLine(conf, "Endpoint");
  const allowed = parseConfLine(conf, "AllowedIPs");
  if (!privateKey || !publicKey || !address || !endpoint) {
    throw new Error("WireGuard conf incomplete — re-pair on home Wi‑Fi");
  }
  const [serverAddress, portStr] = endpoint.split(":");
  const serverPort = Number(portStr || "51820");
  if (!serverAddress || !Number.isFinite(serverPort)) {
    throw new Error(`Invalid WireGuard Endpoint: ${endpoint}`);
  }
  return {
    privateKey,
    publicKey,
    serverAddress,
    serverPort,
    address: address.includes("/") ? address : `${address}/32`,
    // Split-tunnel only the AtleyOS overlay — never 0.0.0.0/0.
    allowedIPs: (allowed || "10.55.0.0/24")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((cidr) => cidr !== "0.0.0.0/0" && cidr !== "::/0"),
    // Do not set VpnService DNS. Android would send *all* DNS via the tunnel;
    // when the peer is asleep/unreachable overnight, the phone loses internet.
    mtu: 1420,
  };
}

type AwayPathStatus = {
  host_endpoint?: string;
  away_ready?: boolean;
  hole_punch?: { host_reflexive?: string };
  nat_map?: { endpoint?: string; ok?: boolean };
};

/** Refresh Endpoint= in stored conf from home /status (away IP). */
export async function refreshConfEndpoint(conf: string): Promise<string> {
  let next = conf;
  try {
    const { clientStatus } = await import("./api");
    const st = await clientStatus();
    const away = (st.remote_access as { away_path?: AwayPathStatus } | undefined)
      ?.away_path;
    const endpoint =
      away?.nat_map?.endpoint?.trim() ||
      away?.host_endpoint?.trim() ||
      away?.hole_punch?.host_reflexive?.trim();
    if (endpoint && next.includes("Endpoint =")) {
      next = next.replace(/Endpoint = .*/g, `Endpoint = ${endpoint}`);
      await saveWgConf(next);
    }
  } catch {
    /* keep stored */
  }
  return next;
}

async function ensureNativeInitialized(wg: NativeWireGuard): Promise<void> {
  if (!initPromise) {
    initPromise = wg.initialize().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  await initPromise;
}

function waitForAppActive(timeoutMs = 120_000): Promise<void> {
  if (AppState.currentState === "active") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      sub.remove();
      reject(new Error("Timed out waiting for VPN permission"));
    }, timeoutMs);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        clearTimeout(t);
        sub.remove();
        resolve();
      }
    });
  });
}

async function nativeConnect(
  wg: NativeWireGuard,
  config: WgConfig,
  retryPermission = true,
): Promise<void> {
  try {
    await wg.connect(config);
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code)
        : "";
    const msg = err instanceof Error ? err.message : String(err);
    if (retryPermission && (code === "VPN_PERMISSION_REQUIRED" || /VPN_PERMISSION/i.test(msg))) {
      await waitForAppActive();
      await wg.connect(config);
      return;
    }
    throw err;
  }
}

export type EnsureTunnelOpts = {
  /**
   * After Wi‑Fi ↔ cellular changes, Android often keeps a stale tunnel that
   * still reports CONNECTED but cannot reach 10.55.0.1. Force a reconnect.
   */
  forceReconnect?: boolean;
  /** Ignore pause flag (Settings → Reconnect). */
  resume?: boolean;
};

export async function isTunnelPaused(): Promise<boolean> {
  try {
    const v = await SecureStore.getItemAsync(PAUSED_KEY);
    // HTTPS-first: missing key means Home VPN off (migrate older installs).
    if (v == null) {
      await SecureStore.setItemAsync(PAUSED_KEY, "1");
      return true;
    }
    return v === "1";
  } catch {
    return true;
  }
}

/** Disconnect VPN so normal phone internet works; stays off until resume/Reconnect. */
export async function pauseTunnel(): Promise<TunnelState> {
  await SecureStore.setItemAsync(PAUSED_KEY, "1");
  await stopTunnel();
  const state: TunnelState = {
    status: "down",
    mode: "unknown",
    message:
      "Home VPN off. Chat still works on Wi‑Fi or Away HTTPS. Turn Home VPN on only for full home-network mode.",
    updatedAt: Date.now(),
  };
  await setTunnelState(state);
  return state;
}

async function clearPaused(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PAUSED_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Bring up / keep up the home tunnel. Safe to call often (app focus, pair, boot).
 * Never requires the user to manually toggle when leaving the house.
 */
export async function ensureTunnel(opts: EnsureTunnelOpts = {}): Promise<TunnelState> {
  if (connectInFlight && !opts.forceReconnect) return connectInFlight;
  const run = (async () => {
    if (opts.resume) await clearPaused();
    if (!opts.resume && (await isTunnelPaused())) {
      const state: TunnelState = {
        status: "down",
        mode: "unknown",
        message:
          "Home VPN off. Use Away HTTPS for Chat off Wi‑Fi, or turn Home VPN on for the full home network.",
        updatedAt: Date.now(),
      };
      await setTunnelState(state);
      return state;
    }

    const session = await loadSession();
    let conf = (await loadWgConf()) || session?.wgClientConf || null;
    // Only refresh Endpoint while we can still talk to home (usually on Wi‑Fi).
    // On cellular the tunnel must come up first with the stored public endpoint.
    if (conf && !opts.forceReconnect) {
      conf = await refreshConfEndpoint(conf);
      await saveWgConf(conf);
    }

    const wg = loadPatchedModule();
    if (!conf) {
      const state: TunnelState = {
        status: "down",
        mode: "unknown",
        message: "Not paired yet — scan the home Remote Access QR on Wi‑Fi.",
        relayUrl: session?.relayUrl,
        updatedAt: Date.now(),
      };
      await setTunnelState(state);
      return state;
    }

    if (!wg) {
      const state: TunnelState = {
        status: "config_ready",
        mode: "lan",
        message:
          "This build has no native VPN. Install the AtleyOS Client APK (not Expo Go).",
        relayUrl: session?.relayUrl,
        updatedAt: Date.now(),
      };
      await setTunnelState(state);
      return state;
    }

    try {
      await ensureNativeInitialized(wg);
      if (opts.forceReconnect) {
        try {
          await wg.disconnect();
        } catch {
          /* ignore */
        }
      } else {
        try {
          const st = await wg.getStatus();
          if (st.isConnected || st.status === "CONNECTED") {
            const state: TunnelState = {
              status: "up",
              mode: "overlay",
              message:
                "Connected to home. Stay connected automatically — no toggle when you leave.",
              relayUrl: session?.relayUrl,
              updatedAt: Date.now(),
            };
            await setTunnelState(state);
            return state;
          }
        } catch {
          /* continue to connect */
        }
      }

      const config = parseWgConf(conf);
      await nativeConnect(wg, config);
      const state: TunnelState = {
        status: "up",
        mode: "overlay",
        message:
          "Connected to home. Away access is automatic — leave the tunnel on.",
        relayUrl: session?.relayUrl,
        updatedAt: Date.now(),
      };
      await setTunnelState(state);
      return state;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const needsPerm = /VPN_PERMISSION/i.test(msg);
      const state: TunnelState = {
        status: needsPerm ? "needs_permission" : "error",
        mode: "unknown",
        message: needsPerm
          ? "Accept the Android VPN permission once. After that, home stays connected automatically."
          : `Tunnel error: ${msg}`,
        relayUrl: session?.relayUrl,
        updatedAt: Date.now(),
      };
      await setTunnelState(state);
      return state;
    }
  })().finally(() => {
    if (connectInFlight === runPromise) connectInFlight = null;
  });
  const runPromise = run;
  connectInFlight = run;
  return run;
}

/** Tear down tunnel (revoke / unpair only). */
export async function stopTunnel(): Promise<void> {
  const wg = loadPatchedModule();
  if (!wg) return;
  try {
    await ensureNativeInitialized(wg);
    await wg.disconnect();
  } catch {
    /* ignore */
  }
  await setTunnelState({
    status: "down",
    mode: "unknown",
    message: "Tunnel stopped",
    updatedAt: Date.now(),
  });
}

/** Away-path: publish a reflexive endpoint hint to the home peer (hole punch). */
export async function publishEndpointHint(endpoint: string): Promise<void> {
  try {
    await postEndpoint(endpoint);
  } catch {
    /* best effort */
  }
}

export function awayPathSummary(relayUrl?: string): string {
  return [
    "Chat uses home Wi‑Fi or Away HTTPS (Cloudflare Tunnel) — no VPN required.",
    "Home VPN is optional for full home-network mode; leave it off for daily Chat.",
    relayUrl ? `Legacy relay hint: ${relayUrl}` : "Profile Continuity can upload when VPN is off.",
  ].join("\n");
}

/** Advanced: share conf (support / debugging). Not required for away. */
export async function exportWgConfForShare(): Promise<{
  conf: string;
  filename: string;
  endpointNote?: string;
} | null> {
  const session = await loadSession();
  let conf = (await loadWgConf()) || session?.wgClientConf || null;
  if (!conf) return null;
  conf = await refreshConfEndpoint(conf);
  return {
    conf,
    filename: "atleyos-client.conf",
    endpointNote: "Debug export only — the app owns the tunnel after pairing.",
  };
}
