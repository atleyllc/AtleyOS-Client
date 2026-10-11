import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { Stack } from "expo-router";
import * as Network from "expo-network";
import { StatusBar } from "expo-status-bar";
import { colors } from "../src/lib/theme";
import { startApprovalLive, syncApprovalPush } from "../src/lib/approvalLive";
import { clearPreferredBase } from "../src/lib/api";
import { syncAwayTunnel } from "../src/lib/wireguard";
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
        // Away apps: off on home Wi‑Fi, on elsewhere (only if the Owner turned it on).
        await syncAwayTunnel({ networkChanged: forceReconnect }).catch(() => undefined);
      })();
    };
    kick(false);
    const approvals = startApprovalLive();
    const appSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        approvals.reconnect();
        void syncApprovalPush().catch(() => undefined);
      }
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
      approvals.stop();
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
          headerTitleStyle: { fontWeight: "700" },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="pair" options={{ title: "Pair with home" }} />
        <Stack.Screen name="learn" options={{ title: "Learn from this device" }} />
        <Stack.Screen name="setup" options={{ title: "Set up this phone" }} />
        <Stack.Screen name="storage" options={{ title: "Storage" }} />
        <Stack.Screen name="search" options={{ title: "Search" }} />
        <Stack.Screen name="connectors" options={{ title: "Connectors" }} />
        <Stack.Screen name="reminders" options={{ title: "Reminders" }} />
        <Stack.Screen name="machines" options={{ title: "Machines" }} />
        <Stack.Screen name="coding" options={{ title: "Coding jobs" }} />
        <Stack.Screen name="away-apps" options={{ title: "Away apps" }} />
        <Stack.Screen name="usage" options={{ title: "AI usage" }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
