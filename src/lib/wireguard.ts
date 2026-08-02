/**
 * WireGuard remote access shim.
 *
 * Production builds should load a native module (Network Extension on iOS,
 * VpnService on Android) that applies the conf from pairing. Until that native
 * module is linked in a custom dev client / EAS build, we:
 * 1. Persist the client conf from pairing
 * 2. Prefer overlay API base, fall back to LAN
 * 3. Exchange reflexive endpoints for hole-punch coordination
 * 4. Surface Owner relay URL for hard NAT
 */

import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { loadSession } from "./session";
import { postEndpoint } from "./api";

const CONF_KEY = "atleyos.wg.conf.v1";
const STATE_KEY = "atleyos.wg.state.v1";

export type TunnelState = {
  status: "down" | "config_ready" | "up" | "error";
  mode: "lan" | "overlay" | "relay" | "unknown";
  message?: string;
  relayUrl?: string;
  updatedAt: number;
};

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

/** Attempt to bring up the tunnel (native when available; otherwise config_ready). */
export async function ensureTunnel(): Promise<TunnelState> {
  const session = await loadSession();
  const conf = (await loadWgConf()) || session?.wgClientConf || null;
  if (conf) await saveWgConf(conf);

  // Placeholder for native WG module:
  // const NativeWG = NativeModules.AtleyOSWireGuard;
  // if (NativeWG?.start) { await NativeWG.start(conf); ... }

  const state: TunnelState = {
    status: conf ? "config_ready" : "down",
    mode: session?.relayUrl ? "relay" : "lan",
    message: conf
      ? `WireGuard config ready (${Platform.OS}). Native tunnel module applies this in EAS/dev-client builds; LAN API used until then.`
      : "No WG conf yet — pair again after enabling Remote Access.",
    relayUrl: session?.relayUrl,
    updatedAt: Date.now(),
  };
  await setTunnelState(state);
  return state;
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
    "1. LAN direct when on home Wi‑Fi",
    "2. UDP hole punch (STUN) when away",
    relayUrl
      ? `3. Owner relay: ${relayUrl}`
      : "3. Configure Owner relay on home Settings → Remote Access if punch fails",
  ].join("\n");
}
