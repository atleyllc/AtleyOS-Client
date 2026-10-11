import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Linking, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
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
  whenLabel,
  type InboxAction,
  type InboxItem,
  type QuietHours,
} from "../../src/lib/inbox";
import { dismissNotice, keepOnlyNotices, loadVisibleNotices, snoozeNotice } from "../../src/lib/inboxStore";
import { loadQuietHours, saveQuietHours } from "../../src/lib/quietStore";
import { loadNotifications, loadServerQuietHours, postNotificationAction, saveServerQuietHours } from "../../src/lib/surface";
import { colors, space } from "../../src/lib/theme";

const ACTION_LABEL: Record<InboxAction, string> = {
  approve: "Allow",
  deny: "Deny",
  snooze: "Snooze 15 min",
  open: "Open",
  dismiss: "Dismiss",
  fix: "Fix it",
  retry: "Retry",
  approve_plan: "Approve plan",
  followup: "Ask a follow-up",
};

/** Buttons shown on the card, in this order. Anything else goes in the ⋯ menu. */
const CARD_ACTIONS: InboxAction[] = ["approve_plan", "fix", "retry", "followup", "dismiss"];

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
    if (remote.supported && !remote.error) {
      // Home's list is the truth: rows it resolved or that were handled elsewhere go away here too.
      await keepOnlyNotices(remote.items.map((item) => item.id));
    } else {
      for (const item of local) {
        if (item.kind === "approval" || approvalIds.has(item.id)) continue;
        merged.set(item.id, item);
      }
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
      if (action === "fix") {
        const out = await postNotificationAction(item.id, "fix");
        const prompt =
          out?.prompt ||
          `Help me fix this alert.\n\nAlert: ${item.title}\nDetails: ${item.body}\n\nCheck what's wrong first and tell me what you found. Ask me before changing anything.`;
        router.push({ pathname: "/chat", params: { send: prompt, fresh: "1", nonce: String(Date.now()) } });
        return;
      }
      if (action === "followup") {
        const out = await postNotificationAction(item.id, "followup");
        router.push({
          pathname: "/chat",
          params: { conversation: out?.conversationId || "", draft: out?.prompt || "About the plan: ", nonce: String(Date.now()) },
        });
        return;
      }
      if (action === "retry" || action === "approve_plan") {
        const out = await postNotificationAction(item.id, action);
        if (!out) throw new Error("This home doesn’t take that action from the phone yet. Use the dashboard.");
        setLastDecision(
          out.message ||
            (action === "retry"
              ? "Backup started. It runs at low priority; this clears when it finishes."
              : "Plan approved. Cursor is building it; progress shows in Chat and here."),
        );
        if (action === "approve_plan") setNotices((current) => current.filter((row) => row.id !== item.id));
        void load();
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
      {notices.map((item) => {
        const buttons = CARD_ACTIONS.filter((a) => item.actions.includes(a));
        const menu = item.actions.filter((a) => !buttons.includes(a));
        const when = whenLabel(item.createdAt);
        const text = item.explanation || item.body;
        return (
          <Section
            key={`${item.kind}-${item.id}`}
            title={item.title}
            icon={kindIcon(item.kind)}
            right={
              <View style={styles.cardRight}>
                <StatusChip label={labelForKind(item.kind, item.source)} tone={kindTone(item.kind)} />
                {menu.length ? (
                  <MenuButton
                    title={item.title}
                    actions={menu.map((action) => ({
                      label: ACTION_LABEL[action],
                      danger: action === "deny",
                      icon: action === "snooze" ? "clock" : action === "deny" ? "close" : action === "open" ? "external" : "check",
                      onPress: () => void act(item, action),
                    }))}
                  />
                ) : null}
              </View>
            }
          >
            {when ? <Text style={styles.when}>{when}</Text> : null}
            {text ? <Text style={ui.body}>{text}</Text> : null}
            {buttons.length ? (
              <View style={styles.buttonRow}>
                {buttons.map((action, index) =>
                  index === 0 && action !== "dismiss" ? (
                    <PrimaryButton
                      key={action}
                      label={ACTION_LABEL[action]}
                      busy={busyId === item.id}
                      disabled={busyId != null}
                      onPress={() => void act(item, action)}
                    />
                  ) : (
                    <SecondaryButton
                      key={action}
                      label={ACTION_LABEL[action]}
                      disabled={busyId != null}
                      onPress={() => void act(item, action)}
                    />
                  ),
                )}
              </View>
            ) : null}
          </Section>
        );
      })}

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

function labelForKind(kind: InboxItem["kind"], source = ""): string {
  const named: Record<string, string> = {
    backup: "Backup",
    storage: "Storage",
    health: "Health",
    machines: "Machines",
    coding: "Cursor",
    connector: "Connector",
  };
  if (named[source]) return named[source];
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
  cardRight: { flexDirection: "row", alignItems: "center", gap: space.xs },
  when: { color: colors.muted, fontSize: 12 },
  buttonRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
