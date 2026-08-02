import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { loadSession } from "../src/lib/session";
import { unlockWithBiometrics } from "../src/lib/biometrics";
import { colors, space } from "../src/lib/theme";
import type { Session } from "../src/lib/types";

export default function Gate() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await loadSession();
      setSession(s);
      if (!s) return;
      const ok = await unlockWithBiometrics();
      setUnlocked(ok);
    })();
  }, []);

  if (session === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.muted}>Starting AtleyOS Client…</Text>
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/pair" />;
  }

  if (!unlocked) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Locked</Text>
        <Text style={styles.muted}>Authenticate to open Chat.</Text>
      </View>
    );
  }

  if (!session.learningConsentAt) {
    return <Redirect href="/learn" />;
  }

  return <Redirect href="/(tabs)/chat" />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  title: { color: colors.text, fontSize: 22, fontWeight: "700" },
  muted: { color: colors.muted },
});
