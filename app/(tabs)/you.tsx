import { useCallback, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import {
  Group,
  GroupLabel,
  IconBadge,
  ListRow,
  MenuButton,
  Note,
  PrimaryButton,
  ProgressBar,
  Screen,
  SecondaryButton,
  Section,
  StatusChip,
  ui,
} from "../../src/components/ui";
import { addMemory, fetchMemory, forgetMemory, type MemoryItem } from "../../src/lib/memory";
import { validateMemoryText, memoryErrorCopy } from "../../src/lib/memoryList";
import {
  getSyncStatus,
  requestAllLearningPermissions,
  runObservationCycle,
} from "../../src/lib/observation";
import { syncCopy } from "../../src/lib/syncCopy";
import type { SyncStatus } from "../../src/lib/types";
import { colors, space } from "../../src/lib/theme";

const SOURCE_LABEL: Record<string, string> = {
  contacts: "Contacts",
  calendar: "Calendar",
  location: "Places",
  photos_metadata: "Photo details",
};

export default function YouScreen() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [startPending, setStartPending] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setSync(await getSyncStatus());
    try {
      const next = await fetchMemory();
      setSupported(next.supported);
      setItems(next.items);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function saveNote() {
    const problem = validateMemoryText(note);
    if (problem) {
      Alert.alert("Couldn’t save", memoryErrorCopy(problem));
      return;
    }
    const text = note.trim();
    setBusy(true);
    try {
      await addMemory(text);
      setNote("");
      await load();
    } catch (e) {
      Alert.alert("Couldn’t save", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function syncPhone() {
    setSyncing(true);
    try {
      await requestAllLearningPermissions();
      await runObservationCycle({
        onProgress: (pending, start) => {
          setStartPending(start);
          setSync((current) => ({ ...(current || { sources: {} }), pending }));
        },
      });
      await load();
    } finally {
      setSyncing(false);
      setStartPending(null);
    }
  }

  async function forget(item: MemoryItem) {
    setBusy(true);
    try {
      await forgetMemory(item.id);
      setItems((current) => current.filter((row) => row.id !== item.id));
    } catch (e) {
      Alert.alert("Couldn’t forget", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const copy = syncCopy(sync, { syncing, startPending });
  const sources = Object.entries(sync?.sources || {}).filter(([key]) => SOURCE_LABEL[key]);
  const shown = showAll ? items : items.slice(0, 5);

  return (
    <Screen title="You" subtitle="What AtleyOS knows about you. It stays on your home server." onRefresh={() => void load()}>
      <Section
        title="From this phone"
        icon="sync"
        right={<StatusChip label={copy.chip} tone={copy.tone} />}
      >
        <Text style={styles.headline}>{copy.headline}</Text>
        {copy.progress != null ? <ProgressBar value={copy.progress} /> : null}
        <Text style={ui.body}>{copy.detail}</Text>
        {sources.length ? (
          <View style={styles.sources}>
            {sources.map(([key, value]) => (
              <StatusChip
                key={key}
                dot={false}
                tone={value.granted ? "muted" : "warn"}
                label={value.granted ? `${SOURCE_LABEL[key]} ${value.lastCount ?? 0}` : `${SOURCE_LABEL[key]} off`}
              />
            ))}
          </View>
        ) : null}
        <SecondaryButton
          label={syncing ? "Syncing…" : "Sync now"}
          icon="sync"
          onPress={() => void syncPhone()}
          disabled={syncing}
        />
      </Section>

      <GroupLabel>Memory</GroupLabel>
      {error ? (
        <Section>
          <Note tone="danger">{error}</Note>
          <SecondaryButton label="Try again" onPress={() => void load()} />
        </Section>
      ) : supported == null ? (
        <Section>
          <Text style={ui.body}>Checking what home will share…</Text>
        </Section>
      ) : supported === false ? (
        <Section>
          <Note>This home server doesn’t share Memory with the phone yet.</Note>
        </Section>
      ) : (
        <>
          <Section>
            <TextInput
              style={ui.input}
              value={note}
              onChangeText={setNote}
              placeholder="Something AtleyOS should remember"
              placeholderTextColor={colors.faint}
              editable={!busy}
              maxLength={4000}
              multiline
            />
            <PrimaryButton
              label={busy ? "Saving…" : "Remember this"}
              onPress={() => void saveNote()}
              disabled={busy || !note.trim()}
            />
          </Section>
          {items.length === 0 ? (
            <Section>
              <View style={styles.emptyMemory}>
                <IconBadge name="memory" tone="muted" />
                <Text style={ui.body}>Nothing saved yet.</Text>
              </View>
            </Section>
          ) : (
            <Group>
              {shown.map((item) => (
                <ListRow
                  key={item.id}
                  icon="memory"
                  tone="muted"
                  title={item.text}
                  subtitle={item.kind || undefined}
                  right={
                    <MenuButton
                      title="Memory"
                      actions={[{ label: "Forget", icon: "trash", danger: true, onPress: () => void forget(item) }]}
                    />
                  }
                />
              ))}
              {items.length > 5 ? (
                <ListRow
                  title={showAll ? "Show fewer" : `Show all ${items.length}`}
                  onPress={() => setShowAll((v) => !v)}
                />
              ) : null}
            </Group>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headline: { color: colors.text, fontSize: 18, fontWeight: "700" },
  sources: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  emptyMemory: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
