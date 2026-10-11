/** Reminders and routines. Hidden until at least one of the routes exists. */

export type ReminderRow = {
  id: string;
  title: string;
  when: string;
  status: string;
};

export type RoutineRow = {
  id: string;
  name: string;
  schedule: string;
  lastResult: string;
  lastRunAt: string;
};

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.trim() : "";
}

function firstArray(root: Record<string, unknown>, keys: string[]): unknown[] | null {
  for (const key of keys) {
    if (Array.isArray(root[key])) return root[key] as unknown[];
  }
  return null;
}

export function parseReminders(body: unknown): { supported: boolean; reminders: ReminderRow[] } {
  const root = record(body);
  if (!root) return { supported: false, reminders: [] };
  const raw = firstArray(root, ["reminders", "items", "alarms"]);
  if (!raw) return { supported: false, reminders: [] };
  const reminders: ReminderRow[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const row = record(item);
    if (!row) continue;
    const title = text(row.title) || text(row.name) || text(row.text);
    const id = text(row.id) || title;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    reminders.push({
      id,
      title: title || id,
      when: text(row.when) || text(row.at) || text(row.due_at) || text(row.time),
      status: text(row.status) || text(row.state),
    });
  }
  return { supported: true, reminders };
}

export function parseRoutines(body: unknown): { supported: boolean; routines: RoutineRow[] } {
  const root = record(body);
  if (!root) return { supported: false, routines: [] };
  const raw = firstArray(root, ["routines", "items", "jobs"]);
  if (!raw) return { supported: false, routines: [] };
  const routines: RoutineRow[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const row = record(item);
    if (!row) continue;
    const name = text(row.name) || text(row.title) || text(row.id);
    const id = text(row.id) || name;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    routines.push({
      id,
      name: name || id,
      schedule: text(row.schedule) || text(row.cron) || text(row.when),
      lastResult: text(row.last_result) || text(row.lastResult) || text(row.result) || text(row.status),
      lastRunAt: text(row.last_run_at) || text(row.last_run) || text(row.ran_at),
    });
  }
  return { supported: true, routines };
}
