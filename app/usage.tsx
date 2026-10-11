import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import type { IconName } from "../src/components/icons";
import {
  EmptyState,
  Group,
  GroupLabel,
  ListRow,
  Note,
  Page,
  ScreenIntro,
  SecondaryButton,
  Section,
  StatusChip,
} from "../src/components/ui";
import { formatTokens, formatUsd, type UsageSnapshot, type UsageSource } from "../src/lib/aiUsage";
import { loadUsage } from "../src/lib/surface";
import { colors, radius, space } from "../src/lib/theme";

const SOURCE_ICON: Record<string, IconName> = { ollama: "cpu", cursor: "coding" };

function sourceLine(s: UsageSource): string {
  if (s.status === "not_connected") return "Not connected";
  if (s.status === "error") return s.error || "Couldn’t read usage";
  const parts = [];
  if (s.outputTokens != null) parts.push(`${formatTokens(s.outputTokens)} tokens out`);
  if (s.id === "ollama") parts.push("free");
  return parts.join(" · ") || "No usage reported";
}

export default function UsageScreen() {
  const [snap, setSnap] = useState<UsageSnapshot | null>(null);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (refresh = false) => {
    const res = await loadUsage(refresh);
    setSupported(res.supported);
    setSnap(res.snapshot);
    setError(res.error);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!supported) {
    return (
      <Page>
        <EmptyState icon="usage" title="AI usage isn’t on this server yet" body="Update AtleyOS on your server to see local, Cursor, ChatGPT, Claude, and Grok usage here." />
      </Page>
    );
  }

  return (
    <Page>
      <ScreenIntro subtitle={`Last ${snap?.days ?? 30} days. Anything a service doesn’t share shows a dash.`} />
      {error ? <Note tone="danger">{error}</Note> : null}
      <View style={styles.stats}>
        <Stat label="API spend" value={formatUsd(snap?.apiSpendUsd ?? null)} />
        <Stat label="Plans / month" value={formatUsd(snap?.plansMonthlyUsd ?? null)} />
        <Stat label="Local tokens" value={formatTokens(snap?.localOutputTokens ?? null)} tone={colors.ok} />
      </View>
      {snap?.sources.length ? (
        <Group>
          {snap.sources.map((s) => (
            <ListRow
              key={s.id}
              icon={SOURCE_ICON[s.id] || "sparkles"}
              tone={s.status === "ok" ? (s.id === "ollama" ? "ok" : "accent") : s.status === "error" ? "danger" : "muted"}
              title={s.title}
              subtitle={sourceLine(s)}
              right={
                s.status === "not_connected" ? (
                  <StatusChip label="Off" tone="muted" />
                ) : (
                  <Text style={styles.amount}>{s.id === "ollama" ? "$0" : formatUsd(s.spendUsd)}</Text>
                )
              }
            />
          ))}
        </Group>
      ) : null}
      {snap?.recommendations.length ? <GroupLabel>Suggestions</GroupLabel> : null}
      {snap?.recommendations.map((r) => (
        <Section key={r.title} title={r.title} icon="sparkles">
          {r.body ? <Text style={styles.body}>{r.body}</Text> : null}
        </Section>
      ))}
      {snap?.plans.length ? <GroupLabel>Plans you pay for</GroupLabel> : null}
      {snap?.plans.length ? (
        <Group>
          {snap.plans.map((p) => (
            <ListRow key={p.label} title={p.label} right={<Text style={styles.amount}>{formatUsd(p.monthlyUsd)}</Text>} />
          ))}
        </Group>
      ) : null}
      <SecondaryButton
        label={busy ? "Refreshing…" : "Refresh now"}
        icon="sync"
        disabled={busy}
        onPress={() =>
          void (async () => {
            setBusy(true);
            try {
              await load(true);
            } finally {
              setBusy(false);
            }
          })()
        }
      />
    </Page>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, tone ? { color: tone } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", gap: space.sm },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: space.md - 4,
    gap: 2,
  },
  statValue: { color: colors.text, fontSize: 20, fontWeight: "700" },
  statLabel: { color: colors.muted, fontSize: 12 },
  amount: { color: colors.text, fontWeight: "700", fontSize: 15 },
  body: { color: colors.muted, fontSize: 14, lineHeight: 20 },
});
