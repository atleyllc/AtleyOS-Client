import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import {
  requestAllLearningPermissions,
  runObservationCycle,
} from "../src/lib/observation";
import { updateSession } from "../src/lib/session";
import { colors, space } from "../src/lib/theme";

export default function LearnScreen() {
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState("");

  async function allowAll() {
    setBusy(true);
    try {
      const grants = await requestAllLearningPermissions();
      setDetail(
        Object.entries(grants)
          .map(([k, v]) => `${k}: ${v ? "on" : "denied"}`)
          .join(" · "),
      );
      await updateSession({ learningConsentAt: Date.now() });
      const status = await runObservationCycle();
      setDetail(
        (d) =>
          `${d}\nSynced pending=${status.pending}` +
          (status.lastError ? ` · ${status.lastError}` : ""),
      );
      router.replace("/(tabs)/chat");
    } catch (e) {
      setDetail(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function customizeLater() {
    await updateSession({ learningConsentAt: Date.now() });
    router.replace("/(tabs)/chat");
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Allow AtleyOS to learn from this phone</Text>
      <Text style={styles.lede}>
        So it can help you better. Data stays on your home AtleyOS — not a cloud
        landlord. You can revoke sources or this device anytime in Settings.
      </Text>
      <Text style={styles.list}>
        Calendar · Contacts · Photos metadata · Location · Device context · Chat
        corrections (always)
      </Text>
      <Pressable style={styles.btn} disabled={busy} onPress={() => void allowAll()}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>Allow all recommended permissions</Text>
        )}
      </Pressable>
      <Pressable style={styles.secondary} onPress={() => void customizeLater()}>
        <Text style={styles.secondaryText}>Continue — customize later</Text>
      </Pressable>
      {!!detail && <Text style={styles.detail}>{detail}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: space.lg, gap: space.md },
  title: { color: colors.text, fontSize: 24, fontWeight: "700" },
  lede: { color: colors.muted, lineHeight: 22 },
  list: { color: colors.text, lineHeight: 22 },
  btn: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "700" },
  secondary: { paddingVertical: 12, alignItems: "center" },
  secondaryText: { color: colors.muted },
  detail: { color: colors.muted, fontSize: 12 },
});
