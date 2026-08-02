import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as Sharing from "expo-sharing";
import { clearSession, loadSession } from "../../src/lib/session";
import { revokeSelf } from "../../src/lib/api";
import {
  awayPathSummary,
  ensureTunnel,
  getTunnelState,
  type TunnelState,
} from "../../src/lib/wireguard";
import {
  getSyncStatus,
  requestAllLearningPermissions,
  runObservationCycle,
} from "../../src/lib/observation";
import type { SyncStatus } from "../../src/lib/types";
import { colors, space } from "../../src/lib/theme";

export default function SettingsScreen() {
  const [tunnel, setTunnel] = useState<TunnelState | null>(null);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [label, setLabel] = useState("");

  const refresh = useCallback(async () => {
    const s = await loadSession();
    setLabel(s?.deviceLabel || "");
    setTunnel(await ensureTunnel());
    setSync(await getSyncStatus());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  async function onRevoke() {
    try {
      await revokeSelf();
    } catch {
      /* still clear local */
    }
    await clearSession();
    router.replace("/pair");
  }

  async function shareSheetDemo() {
    const available = await Sharing.isAvailableAsync();
    Alert.alert(
      "Share → AtleyOS",
      available
        ? "Share sheet ingest will queue Observation items to your home Profile. Use the system share target once the native module is registered in the store build."
        : "Sharing API unavailable on this platform build.",
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ padding: space.md, gap: space.md }}
    >
      <Text style={styles.h}>Device</Text>
      <Text style={styles.p}>{label || "Paired phone"}</Text>

      <Text style={styles.h}>Tunnel</Text>
      <Text style={styles.p}>
        {tunnel?.status} · {tunnel?.mode}
        {"\n"}
        {tunnel?.message}
      </Text>
      <Text style={styles.mono}>{awayPathSummary(tunnel?.relayUrl)}</Text>

      <Text style={styles.h}>Observation sync</Text>
      <Text style={styles.p}>
        Pending: {sync?.pending ?? 0}
        {sync?.lastSyncAt
          ? `\nLast sync: ${new Date(sync.lastSyncAt).toLocaleString()}`
          : ""}
        {sync?.lastError ? `\nError: ${sync.lastError}` : ""}
      </Text>
      <Pressable
        style={styles.btn}
        onPress={() =>
          void (async () => {
            await requestAllLearningPermissions();
            await runObservationCycle();
            await refresh();
          })()
        }
      >
        <Text style={styles.btnText}>Sync now</Text>
      </Pressable>

      <Text style={styles.h}>Share sheet</Text>
      <Pressable style={styles.secondary} onPress={() => void shareSheetDemo()}>
        <Text style={styles.secondaryText}>About Share → AtleyOS</Text>
      </Pressable>

      <Text style={styles.h}>Privacy</Text>
      <Text style={styles.p}>
        Data collected on this phone is sent only to your home AtleyOS over the
        encrypted overlay. See docs/STORE_PRIVACY.md and docs/THREAT_MODEL.md.
      </Text>

      <Pressable
        style={[styles.btn, styles.danger]}
        onPress={() =>
          Alert.alert("Revoke this device?", "Home will drop WG peer + tokens.", [
            { text: "Cancel", style: "cancel" },
            { text: "Revoke", style: "destructive", onPress: () => void onRevoke() },
          ])
        }
      >
        <Text style={styles.btnText}>Revoke device</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  h: { color: colors.text, fontWeight: "700", fontSize: 16, marginTop: space.sm },
  p: { color: colors.muted, lineHeight: 20 },
  mono: {
    color: colors.text,
    fontSize: 12,
    backgroundColor: colors.surface,
    padding: space.sm,
    borderRadius: 8,
  },
  btn: {
    backgroundColor: colors.accent,
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  danger: { backgroundColor: colors.danger },
  btnText: { color: "#fff", fontWeight: "700" },
  secondary: { paddingVertical: 8 },
  secondaryText: { color: colors.accent },
});
