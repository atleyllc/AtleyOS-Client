import { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text } from "react-native";
import { useFocusEffect } from "expo-router";
import { PrimaryButton, QuietButton, ScreenIntro, Section } from "../../src/components/ui";
import { onApprovalsChanged } from "../../src/lib/approvalEvents";
import { decisionResultLine } from "../../src/lib/approvalList";
import {
  decideApproval,
  fetchApprovals,
  rememberApprovalIds,
  type ApprovalItem,
} from "../../src/lib/approvals";
import { colors, space } from "../../src/lib/theme";

export default function ApprovalsScreen() {
  const [supported, setSupported] = useState(true);
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lastDecision, setLastDecision] = useState("");

  const load = useCallback(async () => {
    try {
      const next = await fetchApprovals();
      setSupported(next.supported);
      setItems(next.items);
      setError("");
      if (next.supported) await rememberApprovalIds(next.items.map((item) => item.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => void load(), 20000);
      return () => clearInterval(timer);
    }, [load]),
  );

  useEffect(() => onApprovalsChanged(() => void load()), [load]);

  async function decide(item: ApprovalItem, decision: "allow" | "deny") {
    setBusyId(item.id);
    try {
      const result = await decideApproval(item.id, decision);
      setLastDecision(decisionResultLine(result, decision));
      setItems((current) => current.filter((row) => row.id !== item.id));
    } catch (e) {
      Alert.alert(
        "Couldn’t record that",
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <ScreenIntro
        title="Approvals"
        subtitle="When home needs a decision, it shows up here. A notice says something is waiting. The details stay in this list."
      />
      {lastDecision ? (
        <Section eyebrow="Everyday" title="Last decision">
          <Text style={styles.body}>{lastDecision}</Text>
        </Section>
      ) : null}
      {error ? (
        <Section eyebrow="Everyday" title="Couldn’t load">
          <Text style={styles.body}>{error}</Text>
          <PrimaryButton label="Try again" onPress={() => void load()} />
        </Section>
      ) : !supported ? (
        <Section eyebrow="Everyday" title="Not on this server">
          <Text style={styles.body}>
            This home server doesn’t share approvals with the phone yet. Nothing here is a sample.
          </Text>
        </Section>
      ) : items.length === 0 ? (
        <Section eyebrow="Everyday" title="Waiting">
          <Text style={styles.body}>Nothing is waiting for you.</Text>
        </Section>
      ) : (
        items.map((item) => (
          <Section key={item.id} eyebrow="Everyday" title={item.title}>
            {item.summary ? <Text style={styles.body}>{item.summary}</Text> : null}
            <PrimaryButton
              label={busyId === item.id ? "Sending…" : "Allow"}
              onPress={() => void decide(item, "allow")}
              disabled={busyId != null}
            />
            <QuietButton label="Deny" danger onPress={() => void decide(item, "deny")} />
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
