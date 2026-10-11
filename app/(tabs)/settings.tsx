import { useCallback, useState } from "react";
import { Alert, StyleSheet, Text } from "react-native";
import Constants from "expo-constants";
import { router, useFocusEffect } from "expo-router";
import * as Sharing from "expo-sharing";
import { ModelSwitcher } from "../../src/components/ModelSwitcher";
import {
  Disclosure,
  Group,
  GroupLabel,
  ListRow,
  Screen,
  SecondaryButton,
  Section,
  StatusChip,
  ui,
} from "../../src/components/ui";
import { syncCopy } from "../../src/lib/syncCopy";
import { probeReachability, revokeSelf, type Reachability } from "../../src/lib/api";
import { describeSavedPaths } from "../../src/lib/connectionCopy";
import { getSyncStatus } from "../../src/lib/observation";
import { clearSession, loadSession } from "../../src/lib/session";
import type { SyncStatus } from "../../src/lib/types";
import {
  awayPathSummary,
  ensureTunnel,
  getTunnelState,
  pauseTunnel,
  stopTunnel,
  type TunnelState,
} from "../../src/lib/wireguard";
import { colors, space } from "../../src/lib/theme";

export default function SettingsScreen() {
  const [label, setLabel] = useState("");
  const [paths, setPaths] = useState("");
  const [probe, setProbe] = useState<Reachability | null>(null);
  const [checking, setChecking] = useState(false);
  const [tunnel, setTunnel] = useState<TunnelState | null>(null);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [vpnBusy, setVpnBusy] = useState(false);

  const load = useCallback(async () => {
    const session = await loadSession();
    setLabel(session?.deviceLabel || "This phone");
    setPaths(
      describeSavedPaths({
        lan: session?.lanApiBase || "",
        https: session?.httpsApiBase || "",
        overlay: session?.overlayApiBase || "",
        httpsReady: session?.httpsReady,
      }),
    );
    setTunnel(await getTunnelState());
    setSync(await getSyncStatus());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function checkConnection() {
    setChecking(true);
    try {
      const next = await probeReachability();
      setProbe(next);
      await load();
    } finally {
      setChecking(false);
    }
  }

  function probeLine(): string {
    if (!probe) return "Not checked yet this visit.";
    if (probe.ok) {
      const via = probe.mode === "https" ? "Away" : probe.mode === "lan" ? "LAN" : "Home VPN";
      return `Reached home via ${via} at ${probe.base}.`;
    }
    return probe.message;
  }

  async function turnVpn(on: boolean) {
    setVpnBusy(true);
    try {
      setTunnel(on ? await ensureTunnel({ resume: true, forceReconnect: true }) : await pauseTunnel());
    } finally {
      setVpnBusy(false);
    }
  }

  function repair() {
    Alert.alert(
      "Re-pair on home Wi‑Fi?",
      "Clears this phone’s session. Scan a fresh dashboard QR (Settings → Remote Access → Show pair QR).",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Re-pair",
          onPress: () =>
            void (async () => {
              try {
                await stopTunnel();
              } catch {
                /* local clear still */
              }
              await clearSession();
              router.replace("/pair");
            })(),
        },
      ],
    );
  }

  async function onRevoke() {
    try {
      await stopTunnel();
      await revokeSelf();
    } catch {
      /* still clear local */
    }
    await clearSession();
    router.replace("/pair");
  }

  const vpnOn = tunnel?.status === "up";
  const sc = syncCopy(sync);
  const version = Constants.expoConfig?.version || "";

  return (
    <Screen title="Settings" subtitle={label}>
      <GroupLabel>Connection</GroupLabel>
      <Section
        title={probe ? (probe.ok ? "Home is reachable" : "Can’t reach home") : "Connection"}
        icon="wifi"
        right={
          probe ? (
            <StatusChip
              label={probe.ok ? (probe.mode === "https" ? "Away" : probe.mode === "lan" ? "Wi‑Fi" : "VPN") : "Offline"}
              tone={probe.ok ? "ok" : "danger"}
            />
          ) : null
        }
      >
        <Text style={ui.body}>{probeLine()}</Text>
        <SecondaryButton
          label={checking ? "Checking…" : "Check connection"}
          icon="sync"
          onPress={() => void checkConnection()}
          disabled={checking}
          testID="check-connection"
        />
        <Disclosure title="Saved addresses">
          <Text style={ui.mono}>{paths}</Text>
        </Disclosure>
      </Section>
      <Group>
        <ListRow icon="link" title="Re-pair on home Wi‑Fi" subtitle="Use when Chat says the token was rejected" onPress={repair} chevron />
        <ListRow icon="phone" title="Phone setup guide" onPress={() => router.push("/setup")} chevron />
      </Group>

      <GroupLabel>Chat</GroupLabel>
      <Section title="Chat model" icon="cpu">
        <ModelSwitcher presentation="inline" />
      </Section>

      <GroupLabel>This phone</GroupLabel>
      <Group>
        <ListRow
          icon="sync"
          title="Phone sync"
          subtitle={sc.headline}
          right={<StatusChip label={sc.chip} tone={sc.tone} />}
          onPress={() => router.push("/you")}
          chevron
        />
        <ListRow
          icon="vpn"
          title="Home VPN"
          subtitle={vpnOn ? "Whole phone is on the home network" : "Optional. Chat works without it."}
          right={<StatusChip label={vpnBusy ? "Working…" : vpnOn ? "On" : "Off"} tone={vpnOn ? "ok" : "muted"} />}
          onPress={() => void turnVpn(!vpnOn)}
        />
        <ListRow
          icon="external"
          title="Share to AtleyOS"
          subtitle="Not in this build yet"
          onPress={() =>
            void Sharing.isAvailableAsync().then((available) => {
              Alert.alert(
                "Share → AtleyOS",
                available
                  ? "The share target is not registered in this build yet. Phone sync is the path that works today."
                  : "Sharing isn’t available on this build.",
              );
            })
          }
        />
      </Group>
      {tunnel?.message || tunnel?.relayUrl ? (
        <Disclosure title="Home VPN details">
          <Text style={ui.body}>
            {tunnel?.status || "down"} · {tunnel?.mode || "unknown"}
            {tunnel?.message ? `\n${tunnel.message}` : ""}
          </Text>
          <Text style={ui.mono}>{awayPathSummary(tunnel?.relayUrl)}</Text>
        </Disclosure>
      ) : null}

      <Group>
        <ListRow
          icon="log-out"
          title="Revoke this phone"
          subtitle="Home drops this phone’s keys and tokens"
          danger
          onPress={() =>
            Alert.alert("Revoke this phone?", "Home will drop this phone’s keys and tokens.", [
              { text: "Cancel", style: "cancel" },
              { text: "Revoke", style: "destructive", onPress: () => void onRevoke() },
            ])
          }
        />
      </Group>
      <Text style={styles.footer}>
        AtleyOS Client {version}
        {"\n"}What this phone sends stays on your home AtleyOS.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { color: colors.faint, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: space.sm },
});
