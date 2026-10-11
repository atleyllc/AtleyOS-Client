import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Linking, ScrollView, StyleSheet, Text, TextInput } from "react-native";
import { useFocusEffect } from "expo-router";
import { PrimaryButton, QuietButton, ScreenIntro, Section, Disclosure } from "../../src/components/ui";
import { onApprovalsChanged } from "../../src/lib/approvalEvents";
import { decisionResultLine } from "../../src/lib/approvalList";
import {
  decideApproval,
  fetchApprovals,
  rememberApprovalIds,
  type ApprovalItem,
} from "../../src/lib/approvals";
import { onInboxChanged } from "../../src/lib/inboxEvents";
import {
  parseQuietHours,
  snoozeUntil,
  type InboxAction,
  type InboxItem,
  type QuietHours,
} from "../../src/lib/inbox";
import { dismissNotice, loadVisibleNotices, snoozeNotice } from "../../src/lib/inboxStore";
import { loadQuietHours, saveQuietHours } from "../../src/lib/quietStore";
import { loadNotifications, loadServerQuietHours, postNotificationAction, saveServerQuietHours } from "../../src/lib/surface";
import { colors, space } from "../../src/lib/theme";

const ACTION_LABEL: Record<InboxAction, string> = {
  approve: "Allow",
  deny: "Deny",
  snooze: "Snooze 15 min",
  open: "Open",
  dismiss: "Dismiss",
};

export default function InboxScreen() {
  const [supported, setSupported] = useState(true);
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [notices, setNotices] = useState<InboxItem[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lastDecision, setLastDecision] = useState("");
  const [quiet, setQuiet] = useState<QuietHours>({ enabled: false, start: "22:00", end: "07:00" });
  const quietReady = useRef(false);

  const load = useCallback(async () => {
    if (!quietReady.current) {
      const [storedQuiet, serverQuiet] = await Promise.all([
        loadQuietHours(),
        loadServerQuietHours().catch(() => null),
      ]);
      quietReady.current = true;
      setQuiet(serverQuiet || storedQuiet);
    }
    const [approvalOutcome, remote, local] = await Promise.all([
      fetchApprovals()
        .then((next) => ({ ok: true as const, next }))
        .catch((error: unknown) => ({ ok: false as const, error })),
      loadNotifications().catch(() => ({ supported: false, items: [] as InboxItem[], error: "" })),
      loadVisibleNotices(),
    ]);
    let approvalRows: ApprovalItem[] = [];
    if (approvalOutcome.ok) {
      setSupported(approvalOutcome.next.supported);
      approvalRows = approvalOutcome.next.items;
      setItems(approvalOutcome.next.items);
      setError("");
      if (approvalOutcome.next.supported) {
        await rememberApprovalIds(approvalOutcome.next.items.map((item) => item.id));
      }
    } else {
      const error = approvalOutcome.error;
      setError(error instanceof Error ? error.message : String(error));
    }
    const approvalIds = new Set(approvalRows.map((item) => item.id));
    const merged = new Map<string, InboxItem>();
    for (const item of local) {
      if (item.kind === "approval" || approvalIds.has(item.id)) continue;
      merged.set(item.id, item);
    }
    for (const item of remote.items) {
      if (item.kind === "approval") continue;
      merged.set(item.id, item);
    }
    setNotices([...merged.values()]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => void load(), 20000);
      return () => clearInterval(timer);
    }, [load]),
  );

  useEffect(() => onApprovalsChanged(() => void load()), [load]);
  useEffect(() => onInboxChanged(() => void load()), [load]);

  async function decide(item: ApprovalItem, decision: "allow" | "deny") {
    setBusyId(item.id);
    try {
      const result = await decideApproval(item.id, decision);
      setLastDecision(decisionResultLine(result, decision));
      setItems((current) => current.filter((row) => row.id !== item.id));
    } catch (e) {
      Alert.alert("Couldn’t record that", e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function act(item: InboxItem, action: InboxAction) {
    setBusyId(item.id);
    try {
      if (action === "approve" || action === "deny") {
        const result = await decideApproval(item.id, action === "approve" ? "allow" : "deny");
        setLastDecision(decisionResultLine(result, action === "approve" ? "allow" : "deny"));
        setNotices((current) => current.filter((row) => row.id !== item.id));
        return;
      }
      if (action === "open") {
        if (!item.openUrl) {
          Alert.alert(item.title, "Home didn’t send a link for this.");
          return;
        }
        await Linking.openURL(item.openUrl);
        return;
      }
      if (action === "snooze") {
        await postNotificationAction(item.id, "snooze", 15);
        await snoozeNotice(item.id, snoozeUntil(Date.now(), 15));
      } else if (action === "dismiss") {
        await postNotificationAction(item.id, "dismiss");
        await dismissNotice(item.id);
      }
      setNotices((current) => current.filter((row) => row.id !== item.id));
    } catch (e) {
      Alert.alert(item.title, e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function saveQuiet(next: QuietHours) {
    const parsed = parseQuietHours(next);
    if (!parsed) {
      Alert.alert("Quiet hours", "Use 24-hour times like 22:00 and 07:00.");
      return;
    }
    setQuiet(parsed);
    await saveQuietHours(parsed);
    try {
      await saveServerQuietHours(parsed);
    } catch (e) {
      Alert.alert("Quiet hours", e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <ScreenIntro
        title="Inbox"
        subtitle="Reminders, routine results, approvals, and alerts land here. A notice stays generic. The details stay in this list."
      />
      <Disclosure title="Quiet hours">
        <Text style={styles.body}>
          During quiet hours this phone still records notices. It does not sound or show them until quiet hours end.
        </Text>
        <QuietButton
          label={quiet.enabled ? "Quiet hours are on" : "Quiet hours are off"}
          onPress={() => void saveQuiet({ ...quiet, enabled: !quiet.enabled })}
        />
        <TextInput
          style={styles.input}
          value={quiet.start}
          onChangeText={(start) => setQuiet((current) => ({ ...current, start }))}
          onEndEditing={() => void saveQuiet(quiet)}
          placeholder="22:00"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          value={quiet.end}
          onChangeText={(end) => setQuiet((current) => ({ ...current, end }))}
          onEndEditing={() => void saveQuiet(quiet)}
          placeholder="07:00"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
        />
      </Disclosure>
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
        <Section eyebrow="Everyday" title="Approvals">
          <Text style={styles.body}>This home server doesn’t share approvals with the phone yet.</Text>
        </Section>
      ) : items.length === 0 ? (
        <Section eyebrow="Everyday" title="Approvals">
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
      {notices.map((item) => (
        <Section key={`${item.kind}-${item.id}`} eyebrow="Everyday" title={item.title}>
          {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
          <Text style={styles.kind}>{labelForKind(item.kind)}</Text>
          {item.actions.map((action) =>
            action === "approve" || action === "open" ? (
              <PrimaryButton
                key={action}
                label={busyId === item.id ? "Sending…" : ACTION_LABEL[action]}
                onPress={() => void act(item, action)}
                disabled={busyId != null}
              />
            ) : (
              <QuietButton
                key={action}
                label={ACTION_LABEL[action]}
                danger={action === "deny"}
                onPress={() => void act(item, action)}
              />
            ),
          )}
        </Section>
      ))}
    </ScrollView>
  );
}

function labelForKind(kind: InboxItem["kind"]): string {
  if (kind === "storage_alert") return "Storage alert. Dismiss is the only action on the phone.";
  if (kind === "reminder") return "Reminder";
  if (kind === "routine") return "Routine";
  if (kind === "approval") return "Approval";
  return "Alert";
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.md, gap: space.md, paddingBottom: space.xl },
  body: { color: colors.muted, lineHeight: 21 },
  kind: { color: colors.accent, fontSize: 12, fontWeight: "700" },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    color: colors.text,
  },
});
