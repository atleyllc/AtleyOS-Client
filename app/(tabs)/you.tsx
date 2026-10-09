import { useCallback, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput } from "react-native";
import { useFocusEffect } from "expo-router";
import { Disclosure, PrimaryButton, QuietButton, ScreenIntro, Section } from "../../src/components/ui";
import { addMemory, fetchMemory, forgetMemory, type MemoryItem } from "../../src/lib/memory";
import { validateMemoryText, memoryErrorCopy } from "../../src/lib/memoryList";
import {
  getSyncStatus,
  requestAllLearningPermissions,
  runObservationCycle,
} from "../../src/lib/observation";
import type { SyncStatus } from "../../src/lib/types";
import { colors, space } from "../../src/lib/theme";

export default function YouScreen() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sync, setSync] = useState<SyncStatus | null>(null);

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
    await requestAllLearningPermissions();
    await runObservationCycle();
    await load();
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

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <ScreenIntro
        title="You"
        subtitle="What AtleyOS knows stays on your home server. This phone shows it only when home has a memory route."
      />
      {error ? (
        <Section eyebrow="Everyday" title="Couldn’t load">
          <Text style={styles.body}>{error}</Text>
          <PrimaryButton label="Try again" onPress={() => void load()} />
        </Section>
      ) : supported == null ? (
        <Section eyebrow="Everyday" title="Memory">
          <Text style={styles.body}>Checking what home will share…</Text>
        </Section>
      ) : supported === false ? (
        <Section eyebrow="Everyday" title="Memory">
          <Text style={styles.body}>
            This home server doesn’t let the phone read or change Memory yet. Nothing on this screen is made up.
            Home would need GET /api/client/memory, POST /api/client/memory, and POST /api/client/memory/forget.
          </Text>
        </Section>
      ) : (
        <Section eyebrow="Everyday" title="Memory">
          <TextInput
            style={styles.input}
            value={note}
            onChangeText={setNote}
            placeholder="Add a note home should keep"
            placeholderTextColor={colors.muted}
            editable={!busy}
            maxLength={4000}
          />
          <PrimaryButton
            label={busy ? "Saving…" : "Save memory"}
            onPress={() => void saveNote()}
            disabled={busy || !note.trim()}
          />
          <Disclosure title="Notes">
            {items.length === 0 ? (
              <Text style={styles.body}>Home didn’t return any memories.</Text>
            ) : (
              items.map((item) => (
                <Text key={item.id} style={styles.item}>
                  {item.text}
                  {item.kind ? `\n${item.kind}` : ""}
                </Text>
              ))
            )}
            {items.map((item) => (
              <QuietButton
                key={`forget-${item.id}`}
                label={`Forget “${item.text.slice(0, 42)}”`}
                onPress={() => void forget(item)}
              />
            ))}
          </Disclosure>
        </Section>
      )}

      <Section eyebrow="Everyday" title="From this phone">
        <Text style={styles.body}>
          Pending {sync?.pending ?? 0}
          {sync?.lastSyncAt ? `\nLast sync ${new Date(sync.lastSyncAt).toLocaleString()}` : ""}
          {sync?.lastError ? `\n${sync.lastError}` : ""}
        </Text>
        {supported ? (
          <QuietButton label="Sync this phone" onPress={() => void syncPhone()} />
        ) : (
          <PrimaryButton label="Sync this phone" onPress={() => void syncPhone()} />
        )}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.md, gap: space.md, paddingBottom: space.xl },
  body: { color: colors.muted, lineHeight: 21 },
  item: {
    color: colors.text,
    lineHeight: 21,
    backgroundColor: colors.surface,
    padding: space.sm,
    borderRadius: 10,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    color: colors.text,
  },
});
