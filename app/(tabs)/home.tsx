import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { loadHomeApps, openHomeApp } from "../../src/lib/homeOpeners";
import { defaultHaFavorites } from "../../src/lib/approvals";
import { chatCompletions } from "../../src/lib/api";
import type { HomeApp } from "../../src/lib/types";
import { colors, space } from "../../src/lib/theme";

export default function HomeRailScreen() {
  const [apps, setApps] = useState<HomeApp[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [haBusy, setHaBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setApps(await loadHomeApps());
    } catch (e) {
      Alert.alert("Home apps", e instanceof Error ? e.message : String(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function onOpen(app: HomeApp) {
    try {
      const how = await openHomeApp(app);
      if (how === "store") {
        Alert.alert("Install app", `Opened store for ${app.title}.`);
      }
    } catch (e) {
      Alert.alert("Open failed", e instanceof Error ? e.message : String(e));
    }
  }

  async function runFavorite(label: string, entityId: string) {
    setHaBusy(entityId);
    try {
      const { content } = await chatCompletions([
        {
          role: "user",
          content: `Please turn on or toggle ${label} (${entityId}) if I have granted control.`,
        },
      ]);
      Alert.alert(label, content.slice(0, 400));
    } catch (e) {
      Alert.alert(label, e instanceof Error ? e.message : String(e));
    } finally {
      setHaBusy(null);
    }
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ padding: space.md, gap: space.md }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.accent}
          onRefresh={() => {
            setRefreshing(true);
            void load().finally(() => setRefreshing(false));
          }}
        />
      }
    >
      <Text style={styles.lede}>
        Unified launcher — opens Immich, Nextcloud, Jellyfin, or Home Assistant
        (native app if installed, else over your AtleyOS tunnel). Uploads stay
        in those apps; learning stays in AtleyOS.
      </Text>

      {apps.map((app) => (
        <Pressable key={app.id} style={styles.card} onPress={() => void onOpen(app)}>
          <Text style={styles.cardTitle}>{app.title}</Text>
          <Text style={styles.cardMeta}>{app.app}</Text>
          <Text style={styles.cardUrl}>{app.overlay_url}</Text>
        </Pressable>
      ))}

      <Text style={styles.section}>Quick Home controls</Text>
      <Text style={styles.hint}>Granted HA favorites via Chat → Actions</Text>
      {defaultHaFavorites().map((f) => (
        <Pressable
          key={f.entityId}
          style={styles.fav}
          disabled={haBusy === f.entityId}
          onPress={() => void runFavorite(f.label, f.entityId)}
        >
          <Text style={styles.favText}>
            {haBusy === f.entityId ? "…" : f.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  lede: { color: colors.muted, lineHeight: 20 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: space.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  cardMeta: { color: colors.accent },
  cardUrl: { color: colors.muted, fontSize: 12 },
  section: { color: colors.text, fontWeight: "700", marginTop: space.sm },
  hint: { color: colors.muted, fontSize: 12 },
  fav: {
    backgroundColor: colors.accentDim,
    padding: space.md,
    borderRadius: 12,
  },
  favText: { color: colors.text, fontWeight: "600" },
});
