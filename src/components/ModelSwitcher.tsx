import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import {
  listInstalledModels,
  setActiveChatModel,
  type InstalledModel,
  type ModelCatalog,
} from "../lib/models";
import { colors, space } from "../lib/theme";

type Presentation = "inline" | "chip";

function subtitle(model: InstalledModel): string {
  const place = model.leavesHome ? model.leavingHomeLabel || "Leaves home" : "On this server";
  return model.provider ? `${model.provider} · ${place}` : place;
}

export function ModelSwitcher({ presentation }: { presentation: Presentation }) {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await listInstalledModels();
      setCatalog(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      listInstalledModels()
        .then((next) => {
          if (cancelled) return;
          setCatalog(next);
          setError(null);
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          setError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  async function apply(model: InstalledModel) {
    setBusyId(model.id);
    try {
      const next = await setActiveChatModel(model.id);
      setCatalog(next);
      setError(null);
      if (presentation === "chip") setOpen(false);
    } catch (e) {
      Alert.alert(
        "Couldn’t change model",
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setBusyId(null);
    }
  }

  function choose(model: InstalledModel) {
    if (model.active || busyId) return;
    if (!model.leavesHome) {
      void apply(model);
      return;
    }
    const label = model.leavingHomeLabel || "Leaves home";
    Alert.alert(
      label,
      `${model.name} is a remote model. Chat you send with it can leave your home server.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Use this model", style: "destructive", onPress: () => void apply(model) },
      ],
    );
  }

  const active =
    catalog?.supported === true
      ? catalog.models.find((model) => model.id === catalog.activeId) ?? null
      : null;
  const chipLabel = active
    ? active.leavesHome
      ? `${active.name} · ${active.leavingHomeLabel || "Leaves home"}`
      : active.name
    : catalog?.supported && catalog.activeId
      ? catalog.activeId
      : "Chat model";

  const list = (
    <ModelList
      catalog={catalog}
      loading={loading}
      error={error}
      busyId={busyId}
      onChoose={choose}
      onRetry={() => void load()}
    />
  );

  if (presentation === "chip") {
    if (catalog && !catalog.supported) return null;
    return (
      <>
        <Pressable
          style={styles.chip}
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Chat model, ${chipLabel}. Open model list.`}
          testID="chat-model-chip"
        >
          <Text style={styles.chipText}>{chipLabel}</Text>
        </Pressable>
        <Modal
          visible={open}
          animationType="slide"
          transparent
          onRequestClose={() => setOpen(false)}
        >
          <View style={styles.backdrop} accessibilityViewIsModal>
            <View style={styles.sheet}>
              <Text style={styles.h}>Chat model</Text>
              <Text style={styles.lede}>
                Local models stay on your home server. Anything remote is marked Leaves home.
              </Text>
              {list}
              <Pressable
                style={styles.close}
                onPress={() => setOpen(false)}
                accessibilityRole="button"
              >
                <Text style={styles.closeText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </>
    );
  }

  const showLede = !catalog || catalog.supported;
  return (
    <View>
      {showLede ? (
        <Text style={styles.lede}>
          Local models stay on your home server. Anything remote is marked Leaves home.
        </Text>
      ) : null}
      {list}
    </View>
  );
}

function ModelList({
  catalog,
  loading,
  error,
  busyId,
  onChoose,
  onRetry,
}: {
  catalog: ModelCatalog | null;
  loading: boolean;
  error: string | null;
  busyId: string | null;
  onChoose: (model: InstalledModel) => void;
  onRetry: () => void;
}) {
  if (loading && !catalog) {
    return <ActivityIndicator color={colors.accent} />;
  }
  if (error && !catalog) {
    return (
      <View style={styles.block}>
        <Text style={styles.p}>{error}</Text>
        <Pressable onPress={onRetry} accessibilityRole="button">
          <Text style={styles.link}>Try again</Text>
        </Pressable>
      </View>
    );
  }
  if (!catalog?.supported) {
    return (
      <Text style={styles.p}>
        This home server doesn’t list models yet. Chat still uses the model configured on the
        server.
      </Text>
    );
  }
  if (catalog.models.length === 0) {
    return <Text style={styles.p}>No models are installed on this home server yet.</Text>;
  }
  return (
    <View style={styles.list} accessibilityRole="radiogroup">
      {catalog.models.map((model) => {
        const busy = busyId === model.id;
        return (
          <Pressable
            key={model.id}
            style={[styles.row, model.active && styles.rowActive]}
            onPress={() => onChoose(model)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityState={{ selected: model.active, disabled: busy }}
            accessibilityLabel={
              model.leavesHome
                ? `${model.name}, ${model.leavingHomeLabel || "Leaves home"}${model.active ? ", active" : ""}`
                : `${model.name}, on this server${model.active ? ", active" : ""}`
            }
            testID={`chat-model-${model.id}`}
          >
            <View style={styles.rowText}>
              <Text style={styles.name}>{model.name}</Text>
              <Text style={[styles.meta, model.leavesHome && styles.leaves]}>{subtitle(model)}</Text>
            </View>
            {busy ? (
              <ActivityIndicator color={colors.accent} />
            ) : model.active ? (
              <Text style={styles.active}>Active</Text>
            ) : (
              <Text style={styles.use}>Use</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: "flex-start",
    marginHorizontal: space.md,
    marginTop: space.sm,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: space.md,
    gap: space.sm,
    maxHeight: "80%",
  },
  h: { color: colors.text, fontWeight: "700", fontSize: 16 },
  lede: { color: colors.muted, lineHeight: 20 },
  p: { color: colors.muted, lineHeight: 20 },
  block: { gap: space.sm },
  link: { color: colors.accent, fontWeight: "700" },
  list: { gap: space.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: 12,
    paddingHorizontal: space.md,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowActive: { borderColor: colors.accent },
  rowText: { flex: 1, gap: 2 },
  name: { color: colors.text, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: 12 },
  leaves: { color: colors.danger },
  active: { color: colors.accent, fontWeight: "700" },
  use: { color: colors.muted, fontWeight: "600" },
  close: { paddingVertical: 12, alignItems: "center" },
  closeText: { color: colors.accent, fontWeight: "700" },
});
