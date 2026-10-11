import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { useFocusEffect } from "expo-router";
import { PrimaryButton, ScreenIntro, Section } from "../src/components/ui";
import type { ConnectorRow } from "../src/lib/connectors";
import { loadConnectors } from "../src/lib/surface";
import { colors, space } from "../src/lib/theme";

export default function ConnectorsScreen() {
  const [supported, setSupported] = useState(true);
  const [rows, setRows] = useState<ConnectorRow[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const next = await loadConnectors();
    setSupported(next.supported);
    setRows(next.connectors);
    setError(next.error);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <ScreenIntro title="Connectors" subtitle="MCP servers home has published for this phone." />
      {error ? (
        <Section eyebrow="Everyday" title="Couldn’t load">
          <Text style={styles.body}>{error}</Text>
          <PrimaryButton label="Try again" onPress={() => void load()} />
        </Section>
      ) : !supported ? (
        <Section eyebrow="Everyday" title="Not on this server">
          <Text style={styles.body}>This home server doesn’t share connectors with the phone yet.</Text>
        </Section>
      ) : rows.length === 0 ? (
        <Section eyebrow="Everyday" title="Waiting">
          <Text style={styles.body}>Home didn’t return any connectors.</Text>
        </Section>
      ) : (
        rows.map((row) => (
          <Section key={row.id} eyebrow="Everyday" title={row.name}>
            <Text style={styles.body}>
              {row.transport}
              {row.status ? ` · ${row.status}` : ""}
              {row.detail ? `\n${row.detail}` : ""}
            </Text>
          </Section>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.md, gap: space.md, paddingBottom: space.xl },
  body: { color: colors.muted, lineHeight: 21 },
});
