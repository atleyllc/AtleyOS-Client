import { useCallback, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text } from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as Sharing from "expo-sharing";
import { ModelSwitcher } from "../../src/components/ModelSwitcher";
import { Disclosure, PrimaryButton, QuietButton, ScreenIntro, Section } from "../../src/components/ui";
import { probeReachability, revokeSelf, type Reachability } from "../../src/lib/api";
import { describeSavedPaths } from "../../src/lib/connectionCopy";
import {
  getSyncStatus,
  requestAllLearningPermissions,
  runObservationCycle,
} from "../../src/lib/observation";
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

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <ScreenIntro title="Settings" subtitle={label} />

      <Section eyebrow="Setup" title="Connection">
        <Text style={styles.body}>{paths}</Text>
        <Text style={styles.body}>{probeLine()}</Text>
        <PrimaryButton
          label={checking ? "Checking…" : "Check connection"}
          onPress={() => void checkConnection()}
          disabled={checking}
          testID="check-connection"
        />
        <Disclosure title="Pairing">
          <Text style={styles.body}>
            If Chat says the token was rejected, this phone still has an old pair. On home Wi‑Fi, scan a fresh QR.
          </Text>
          <QuietButton label="Re-pair on home Wi‑Fi" onPress={repair} />
          <QuietButton label="Phone setup guide" onPress={() => router.push("/setup")} />
        </Disclosure>
      </Section>

      <Section eyebrow="Everyday" title="Chat model">
        <ModelSwitcher presentation="inline" />
      </Section>

      <Section eyebrow="Everyday" title="Learning">
        <Text style={styles.body}>
          Pending {sync?.pending ?? 0}
          {sync?.lastSyncAt ? `\nLast sync ${new Date(sync.lastSyncAt).toLocaleString()}` : ""}
          {sync?.lastError ? `\n${sync.lastError}` : ""}
        </Text>
        <PrimaryButton
          label="Sync this phone"
          onPress={() =>
            void (async () => {
              await requestAllLearningPermissions();
              await runObservationCycle();
              await load();
            })()
          }
        />
      </Section>

      <Section eyebrow="Advanced" title="Home VPN and this device">
        <Text style={styles.body}>
          Chat uses home Wi‑Fi or Away. Home VPN is optional, for when the whole phone should be on the home network.
        </Text>
        <Disclosure title="Home VPN">
          <Text style={styles.body}>
            {tunnel?.status || "down"} · {tunnel?.mode || "unknown"}
            {tunnel?.message ? `\n${tunnel.message}` : ""}
          </Text>
          <Text style={styles.mono}>{awayPathSummary(tunnel?.relayUrl)}</Text>
          <PrimaryButton
            label={vpnBusy ? "Working…" : vpnOn ? "Turn off Home VPN" : "Turn on Home VPN"}
            onPress={() => void turnVpn(!vpnOn)}
            disabled={vpnBusy}
          />
        </Disclosure>
        <Disclosure title="Share sheet and revoke">
          <Text style={styles.body}>
            Share → AtleyOS will queue items for your home Profile once the native share target is in the store build.
          </Text>
          <QuietButton
            label="About Share → AtleyOS"
            onPress={() =>
              void Sharing.isAvailableAsync().then((available) => {
                Alert.alert(
                  "Share → AtleyOS",
                  available
                    ? "The share target is not registered in this build yet. Observation sync above is the path that works today."
                    : "Sharing isn’t available on this build.",
                );
              })
            }
          />
          <QuietButton
            label="Revoke this phone"
            danger
            onPress={() =>
              Alert.alert("Revoke this phone?", "Home will drop this phone’s keys and tokens.", [
                { text: "Cancel", style: "cancel" },
                { text: "Revoke", style: "destructive", onPress: () => void onRevoke() },
              ])
            }
          />
          <Text style={styles.body}>
            What this phone sends stays on your home AtleyOS. See the privacy notes in the project docs.
          </Text>
        </Disclosure>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.md, gap: space.md, paddingBottom: space.xl },
  body: { color: colors.muted, lineHeight: 21 },
  mono: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 18,
    backgroundColor: colors.surface,
    padding: space.sm,
    borderRadius: 8,
  },
});
