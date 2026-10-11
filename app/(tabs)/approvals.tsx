import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Linking, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import {
  EmptyState,
  Group,
  GroupLabel,
  IconBadge,
  ListRow,
  MenuButton,
  Note,
  PrimaryButton,
  Screen,
  SecondaryButton,
  Section,
  Sheet,
  StatusChip,
  ui,
  type Tone,
} from "../../src/components/ui";
import type { IconName } from "../../src/components/icons";
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
  const [quietOpen, setQuietOpen] = useState(false);

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

  const nothing = !error && supported && items.length === 0 && notices.length === 0;

  return (
    <Screen
      title="Inbox"
      right={
        <SecondaryButton
          label={quiet.enabled ? `Quiet ${quiet.start}–${quiet.end}` : "Quiet hours"}
          icon="moon"
          onPress={() => setQuietOpen(true)}
        />
      }
      onRefresh={() => void load()}
    >
      {lastDecision ? <Note tone="ok" icon="check">{lastDecision}</Note> : null}
      {error ? (
        <Section>
          <Note tone="danger">{error}</Note>
          <SecondaryButton label="Try again" onPress={() => void load()} />
        </Section>
      ) : !supported ? (
        <Note>This home server doesn’t share approvals with the phone yet.</Note>
      ) : null}

      {items.length ? <GroupLabel>Needs your OK</GroupLabel> : null}
      {items.map((item) => (
        <Section key={item.id} title={item.title} icon="shield" right={<StatusChip label="Waiting" tone="warn" />}>
          {item.summary ? <Text style={ui.body}>{item.summary}</Text> : null}
          <View style={styles.actions}>
            <View style={styles.flex}>
              <SecondaryButton label="Deny" danger onPress={() => void decide(item, "deny")} disabled={busyId != null} />
            </View>
            <View style={styles.flex}>
              <PrimaryButton
                label="Allow"
                busy={busyId === item.id}
                onPress={() => void decide(item, "allow")}
                disabled={busyId != null}
              />
            </View>
          </View>
        </Section>
      ))}

      {notices.length ? <GroupLabel>Notices</GroupLabel> : null}
      {notices.length ? (
        <Group>
          {notices.map((item) => {
            const primary = item.actions.find((a) => a === "approve" || a === "open");
            const rest = item.actions.filter((a) => a !== primary);
            return (
              <ListRow
                key={`${item.kind}-${item.id}`}
                icon={kindIcon(item.kind)}
                tone={kindTone(item.kind)}
                title={item.title}
                subtitle={[labelForKind(item.kind), item.body].filter(Boolean).join(" · ")}
                onPress={primary ? () => void act(item, primary) : undefined}
                right={
                  <MenuButton
                    title={item.title}
                    actions={rest.map((action) => ({
                      label: ACTION_LABEL[action],
                      danger: action === "deny",
                      icon: action === "dismiss" ? "close" : action === "snooze" ? "clock" : action === "deny" ? "close" : "check",
                      onPress: () => void act(item, action),
                    }))}
                  />
                }
              />
            );
          })}
        </Group>
      ) : null}

      {nothing ? (
        <EmptyState icon="inbox" title="You’re all caught up" body="Approvals, reminders, and alerts from home show up here." />
      ) : null}

      <Sheet visible={quietOpen} onClose={() => setQuietOpen(false)} title="Quiet hours">
        <Text style={ui.body}>
          During quiet hours this phone still records notices. It doesn’t sound or show them until quiet hours end.
        </Text>
        <Group>
          <ListRow
            icon="moon"
            title="Quiet hours"
            right={<StatusChip label={quiet.enabled ? "On" : "Off"} tone={quiet.enabled ? "accent" : "muted"} />}
            onPress={() => void saveQuiet({ ...quiet, enabled: !quiet.enabled })}
          />
        </Group>
        <View style={styles.actions}>
          <View style={styles.flex}>
            <Text style={styles.fieldLabel}>From</Text>
            <TextInput
              style={ui.input}
              value={quiet.start}
              onChangeText={(start) => setQuiet((current) => ({ ...current, start }))}
              onEndEditing={() => void saveQuiet(quiet)}
              placeholder="22:00"
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
            />
          </View>
          <View style={styles.flex}>
            <Text style={styles.fieldLabel}>Until</Text>
            <TextInput
              style={ui.input}
              value={quiet.end}
              onChangeText={(end) => setQuiet((current) => ({ ...current, end }))}
              onEndEditing={() => void saveQuiet(quiet)}
              placeholder="07:00"
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
            />
          </View>
        </View>
      </Sheet>
    </Screen>
  );
}

function labelForKind(kind: InboxItem["kind"]): string {
  if (kind === "storage_alert") return "Storage";
  if (kind === "reminder") return "Reminder";
  if (kind === "routine") return "Routine";
  if (kind === "approval") return "Approval";
  return "Alert";
}

function kindIcon(kind: InboxItem["kind"]): IconName {
  if (kind === "storage_alert") return "storage";
  if (kind === "reminder") return "reminders";
  if (kind === "routine") return "clock";
  if (kind === "approval") return "shield";
  return "alert";
}

function kindTone(kind: InboxItem["kind"]): Tone {
  if (kind === "storage_alert") return "danger";
  if (kind === "approval") return "warn";
  return "accent";
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: space.sm },
  flex: { flex: 1, gap: space.xxs },
  fieldLabel: { color: colors.muted, fontSize: 12, fontWeight: "600" },
});
