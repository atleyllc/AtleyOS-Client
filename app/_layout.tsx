import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { Stack } from "expo-router";
import * as Network from "expo-network";
import { StatusBar } from "expo-status-bar";
import { colors } from "../src/lib/theme";
import { clearPreferredBase } from "../src/lib/api";
import { ensureTunnel, isTunnelPaused } from "../src/lib/wireguard";
import { loadSession } from "../src/lib/session";

export default function RootLayout() {
  const lastNetType = useRef<Network.NetworkStateType | null>(null);

  useEffect(() => {
    let alive = true;
    const kick = (forceReconnect = false) => {
      void (async () => {
        if (!alive) return;
        const s = await loadSession();
        if (!s) return;
        // HTTPS-first: do not auto-start Home VPN unless Owner left it On.
        if (await isTunnelPaused()) return;
        await ensureTunnel({ forceReconnect });
      })();
    };
    kick(false);
    const appSub = AppState.addEventListener("change", (state) => {
      if (state === "active") kick(false);
    });
    const netSub = Network.addNetworkStateListener((event) => {
      const type = event.type ?? Network.NetworkStateType.UNKNOWN;
      const prev = lastNetType.current;
      lastNetType.current = type;
      if (prev == null) return;
      if (prev === type) return;
      clearPreferredBase();
      kick(true);
    });
    void Network.getNetworkStateAsync()
      .then((s) => {
        lastNetType.current = s.type ?? Network.NetworkStateType.UNKNOWN;
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      appSub.remove();
      netSub.remove();
    };
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: "600" },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="pair" options={{ title: "Pair with home" }} />
        <Stack.Screen name="learn" options={{ title: "Learn from this device" }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
