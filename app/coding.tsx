import { useCallback, useState } from "react";
import { Alert, Linking, Text } from "react-native";
import { useFocusEffect } from "expo-router";
import {
  EmptyState,
  Group,
  GroupLabel,
  ListRow,
  MenuButton,
  Note,
  Page,
  ProgressBar,
  ScreenIntro,
  Section,
  StatusChip,
  ui,
} from "../src/components/ui";
import { codingTone, type CodingJob, type CodingSnapshot } from "../src/lib/coding";
import { cancelCodingJob, loadCoding } from "../src/lib/surface";

export default function CodingScreen() {
  const [snap, setSnap] = useState<CodingSnapshot | null>(null);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await loadCoding();
    setSupported(res.supported);
    setSnap(res.snapshot);
    setError(res.error);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => void load(), 10000);
      return () => clearInterval(timer);
    }, [load]),
  );

  function actions(job: CodingJob) {
    const list = [];
    if (job.prUrl) list.push({ label: `Open pull request${job.prNumber ? ` #${job.prNumber}` : ""}`, icon: "external" as const, onPress: () => void Linking.openURL(job.prUrl) });
    if (["starting", "queued", "running", "waiting_approval"].includes(job.status)) {
      list.push({
        label: "Cancel job",
        icon: "close" as const,
        danger: true,
        onPress: () =>
          void cancelCodingJob(job.id)
            .then(load)
            .catch((e: unknown) => Alert.alert("Couldn’t cancel", e instanceof Error ? e.message : String(e))),
      });
    }
    return list;
  }

  function row(job: CodingJob) {
    return (
      <ListRow
        key={job.id}
        icon="coding"
        tone={codingTone(job)}
        title={job.title}
        subtitle={[job.repo, job.phase || job.tierLabel].filter(Boolean).join(" · ")}
        onPress={job.prUrl ? () => void Linking.openURL(job.prUrl) : undefined}
        right={
          <>
            <StatusChip label={job.statusLabel || job.status} tone={codingTone(job)} />
            <MenuButton title={job.title} actions={actions(job)} />
          </>
        }
      />
    );
  }

  if (!supported) {
    return (
      <Page>
        <EmptyState icon="coding" title="Coding jobs aren’t on this server yet" body="Update AtleyOS on your server, then ask Chat to fix or build something in a repo." />
      </Page>
    );
  }

  return (
    <Page>
      <ScreenIntro subtitle="Ask Chat for a change in StrikeNote, Anchor, or AtleyOS. It opens a pull request here." />
      {error ? <Note tone="danger">{error}</Note> : null}
      {snap && snap.localSharePct != null ? (
        <Section title="Savings this cycle" icon="usage" right={<StatusChip label={`${snap.localSharePct}% local`} tone="ok" dot={false} />}>
          <ProgressBar value={snap.localSharePct / 100} tone="ok" />
          {snap.headline ? <Text style={ui.body}>{snap.headline}</Text> : null}
          {snap.planLabel ? <Text style={ui.body}>{snap.planLabel}{snap.planLine ? ` · ${snap.planLine}` : ""}</Text> : null}
        </Section>
      ) : null}
      {snap?.open.length ? <GroupLabel>Working now</GroupLabel> : null}
      {snap?.open.length ? <Group>{snap.open.map(row)}</Group> : null}
      {snap?.recent.length ? <GroupLabel>Recent</GroupLabel> : null}
      {snap?.recent.length ? <Group>{snap.recent.map(row)}</Group> : null}
      {snap && !snap.open.length && !snap.recent.length ? (
        <EmptyState icon="coding" title="No coding jobs yet" body="Try “Fix the StrikeNote sync bug” in Chat." />
      ) : null}
    </Page>
  );
}
