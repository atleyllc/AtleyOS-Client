import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { useFocusEffect } from "expo-router";
import { PrimaryButton, ScreenIntro, Section } from "../src/components/ui";
import { loadStorage } from "../src/lib/surface";
import { formatBytes, type StorageSnapshot } from "../src/lib/storage";
import { colors, space } from "../src/lib/theme";

export default function StorageScreen() {
  const [supported, setSupported] = useState(true);
  const [snapshot, setSnapshot] = useState<StorageSnapshot | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const next = await loadStorage();
    setSupported(next.supported);
    setSnapshot(next.snapshot);
    setError(next.error);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const backup = snapshot?.backup;
  const backupWhen = backup?.lastSuccessAt ? new Date(backup.lastSuccessAt).toLocaleString() : "";

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <ScreenIntro
        title="Storage"
        subtitle="Drive roles, free space, health, and backup status from home."
      />
      {error ? (
        <Section eyebrow="Everyday" title="Couldn’t load">
          <Text style={styles.body}>{error}</Text>
          <PrimaryButton label="Try again" onPress={() => void load()} />
        </Section>
      ) : null}
      {!supported ? (
        <Section eyebrow="Everyday" title="Not on this server">
          <Text style={styles.body}>This home server doesn’t share storage with the phone yet.</Text>
        </Section>
      ) : (
        <>
          {snapshot?.health ? (
            <Section eyebrow="Everyday" title="Health">
              <Text style={styles.body}>{snapshot.health}</Text>
            </Section>
          ) : null}
          {(snapshot?.drives || []).map((drive) => (
            <Section key={drive.id} eyebrow="Everyday" title={drive.label}>
              <Text style={styles.body}>
                {`Role: ${drive.role}`}
                {"\n"}
                {`Free ${formatBytes(drive.freeBytes)} of ${formatBytes(drive.totalBytes)}`}
                {drive.health ? `\nHealth: ${drive.health}` : ""}
              </Text>
            </Section>
          ))}
          {backup ? (
            <Section eyebrow="Everyday" title="Backup">
              <Text style={styles.body}>
                {backup.status || "Home didn’t report a status."}
                {backup.detail ? `\n${backup.detail}` : ""}
                {backupWhen ? `\nLast success ${backupWhen}` : ""}
              </Text>
            </Section>
          ) : null}
          {!snapshot?.drives.length && !backup && !snapshot?.health && !error ? (
            <Section eyebrow="Everyday" title="Waiting">
              <Text style={styles.body}>Home didn’t report drives yet.</Text>
            </Section>
          ) : null}
        </>
      )}
      <Section eyebrow="Advanced" title="Changes stay on the dashboard">
        <Text style={styles.body}>Erase, move, and restore stay on the home dashboard.</Text>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.md, gap: space.md, paddingBottom: space.xl },
  body: { color: colors.muted, lineHeight: 21 },
});
