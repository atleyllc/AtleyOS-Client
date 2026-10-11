import { useCallback, useState } from "react";
import { Alert, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import {
  EmptyState,
  Group,
  GroupLabel,
  ListRow,
  Note,
  Page,
  PrimaryButton,
  ScreenIntro,
  SecondaryButton,
  Section,
  StatusChip,
  ui,
} from "../src/components/ui";
import { machineIcon, machineTone, type MachinesSnapshot } from "../src/lib/machines";
import { decideMachineJob, loadMachines } from "../src/lib/surface";
import { space } from "../src/lib/theme";

export default function MachinesScreen() {
  const [snap, setSnap] = useState<MachinesSnapshot | null>(null);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await loadMachines();
    setSupported(res.supported);
    setSnap(res.snapshot);
    setError(res.error);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => void load(), 15000);
      return () => clearInterval(timer);
    }, [load]),
  );

  async function decide(id: string, allow: boolean) {
    setBusyId(id);
    try {
      await decideMachineJob(id, allow);
      await load();
    } catch (e) {
      Alert.alert("Couldn’t record that", e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  if (!supported) {
    return (
      <Page>
        <EmptyState icon="machines" title="Machines isn’t on this server yet" body="Update AtleyOS on your server to see the Mac and PC workers here." />
      </Page>
    );
  }

  return (
    <Page>
      <ScreenIntro subtitle={snap ? `${snap.online} of ${snap.total} online. AtleyOS sends builds and jobs to these.` : "Loading…"} />
      {error ? <Note tone="danger">{error}</Note> : null}
      {snap?.machines.length ? (
        <Group>
          {snap.machines.map((m) => (
            <ListRow
              key={m.name}
              icon={machineIcon(m)}
              tone={machineTone(m)}
              title={m.label}
              subtitle={[m.currentJob ? `Working on ${m.currentJob}` : "", m.readings].filter(Boolean).join(" · ") || undefined}
              right={<StatusChip label={m.stateLabel} tone={machineTone(m)} />}
            />
          ))}
        </Group>
      ) : snap ? (
        <EmptyState icon="machines" title="No machines paired" body="Pair the Mac or PC from Machines on the home dashboard." />
      ) : null}

      {snap?.pending.length ? <GroupLabel>Needs your OK</GroupLabel> : null}
      {snap?.pending.map((job) => (
        <Section key={job.id} title={job.title} icon="shield" right={<StatusChip label="Waiting" tone="warn" />}>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <SecondaryButton label="Deny" danger onPress={() => void decide(job.id, false)} disabled={busyId != null} />
            </View>
            <View style={{ flex: 1 }}>
              <PrimaryButton label="Allow" busy={busyId === job.id} onPress={() => void decide(job.id, true)} disabled={busyId != null} />
            </View>
          </View>
        </Section>
      ))}

      {snap?.jobs.length ? <GroupLabel>Recent jobs</GroupLabel> : null}
      {snap?.jobs.length ? (
        <Group>
          {snap.jobs.map((job) => (
            <ListRow
              key={job.id}
              title={job.title}
              subtitle={job.machine ? `On ${job.machine}` : undefined}
              right={<StatusChip label={job.statusLabel || job.status} tone={job.status === "running" ? "accent" : job.status === "failed" ? "danger" : "muted"} />}
            />
          ))}
        </Group>
      ) : null}
      {snap && !snap.jobs.length && !snap.pending.length ? <Text style={ui.body}>No jobs yet.</Text> : null}
    </Page>
  );
}
