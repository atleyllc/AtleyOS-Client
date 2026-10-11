import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { useFocusEffect } from "expo-router";
import { PrimaryButton, ScreenIntro, Section } from "../src/components/ui";
import type { ReminderRow, RoutineRow } from "../src/lib/reminders";
import { loadReminders, loadRoutines } from "../src/lib/surface";
import { colors, space } from "../src/lib/theme";

export default function RemindersScreen() {
  const [remindersOn, setRemindersOn] = useState(true);
  const [routinesOn, setRoutinesOn] = useState(true);
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [routines, setRoutines] = useState<RoutineRow[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [nextReminders, nextRoutines] = await Promise.all([loadReminders(), loadRoutines()]);
    setRemindersOn(nextReminders.supported);
    setRoutinesOn(nextRoutines.supported);
    setReminders(nextReminders.reminders);
    setRoutines(nextRoutines.routines);
    setError(nextReminders.error || nextRoutines.error);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const supported = remindersOn || routinesOn;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <ScreenIntro title="Reminders" subtitle="Reminders and routines from home. Results also land in Inbox." />
      {error ? (
        <Section eyebrow="Everyday" title="Couldn’t load">
          <Text style={styles.body}>{error}</Text>
          <PrimaryButton label="Try again" onPress={() => void load()} />
        </Section>
      ) : null}
      {!supported ? (
        <Section eyebrow="Everyday" title="Not on this server">
          <Text style={styles.body}>This home server doesn’t share reminders or routines with the phone yet.</Text>
        </Section>
      ) : null}
      {remindersOn ? (
        <Section eyebrow="Everyday" title="Reminders">
          {reminders.length === 0 ? <Text style={styles.body}>No reminders.</Text> : null}
          {reminders.map((row) => (
            <Text key={row.id} style={styles.body}>
              {row.title}
              {row.when ? ` · ${row.when}` : ""}
              {row.status ? ` · ${row.status}` : ""}
            </Text>
          ))}
        </Section>
      ) : null}
      {routinesOn ? (
        <Section eyebrow="Everyday" title="Routines">
          {routines.length === 0 ? <Text style={styles.body}>No routines.</Text> : null}
          {routines.map((row) => (
            <Text key={row.id} style={styles.body}>
              {row.name}
              {row.schedule ? ` · ${row.schedule}` : ""}
              {row.lastResult ? `\n${row.lastResult}` : ""}
              {row.lastRunAt ? `\nLast run ${row.lastRunAt}` : ""}
            </Text>
          ))}
        </Section>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.md, gap: space.md, paddingBottom: space.xl },
  body: { color: colors.muted, lineHeight: 21 },
});
