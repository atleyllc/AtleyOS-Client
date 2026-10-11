import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput } from "react-native";
import { useFocusEffect } from "expo-router";
import { PrimaryButton, QuietButton, ScreenIntro, Section } from "../src/components/ui";
import { openCitationUrl } from "../src/lib/homeOpeners";
import { cloudEmbeddingWarning } from "../src/lib/searchParse";
import { loadSearch } from "../src/lib/surface";
import type { SearchHit } from "../src/lib/searchParse";
import { colors, space } from "../src/lib/theme";

export default function SearchScreen() {
  const [supported, setSupported] = useState(true);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const run = useCallback(async (text: string) => {
    setBusy(true);
    try {
      const next = await loadSearch(text);
      setSupported(next.supported);
      setHits(next.snapshot.hits);
      setWarning(cloudEmbeddingWarning(next.snapshot.embeddingRoute));
      setError(next.error);
      setNote(next.supported && text && next.snapshot.hits.length === 0 ? "No matches." : "");
    } finally {
      setBusy(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void run("");
    }, [run]),
  );

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ScreenIntro title="Search" subtitle="Files on your home server. Results show the path, page, and a snippet." />
      {!supported ? (
        <Section eyebrow="Everyday" title="Not on this server">
          <Text style={styles.body}>This home server doesn’t share search with the phone yet.</Text>
        </Section>
      ) : (
        <>
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Search home files"
            placeholderTextColor={colors.muted}
            onSubmitEditing={() => void run(query.trim())}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <PrimaryButton
            label={busy ? "Searching…" : "Search"}
            onPress={() => void run(query.trim())}
            disabled={busy}
          />
          {warning ? <Text style={styles.warn}>{warning}</Text> : null}
          {error ? <Text style={styles.warn}>{error}</Text> : null}
          {note ? <Text style={styles.body}>{note}</Text> : null}
          {hits.map((hit, index) => (
            <Section key={`${hit.path}-${index}`} eyebrow="Everyday" title={hit.title || hit.path || "Result"}>
              {hit.path ? <Text style={styles.body}>{hit.page ? `${hit.path} · page ${hit.page}` : hit.path}</Text> : null}
              {hit.snippet ? <Text style={styles.body}>{hit.snippet}</Text> : null}
              {hit.openUrl ? <QuietButton label="Open" onPress={() => void openCitationUrl(hit.openUrl)} /> : null}
            </Section>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.md, gap: space.md, paddingBottom: space.xl },
  body: { color: colors.muted, lineHeight: 21 },
  warn: { color: colors.danger, lineHeight: 20 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    color: colors.text,
  },
});
