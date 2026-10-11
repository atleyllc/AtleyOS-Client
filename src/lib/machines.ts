/** GET /api/client/machines: the server, the Air, Hades, and their jobs. */
import { arr, bool, num, rec, str } from "./parse";
import type { Tone } from "./tone";

export type MachineRow = {
  name: string;
  label: string;
  os: string;
  online: boolean;
  state: string;
  stateLabel: string;
  isServer: boolean;
  currentJob: string;
  readings: string;
};

export type MachineJob = {
  id: string;
  title: string;
  status: string;
  statusLabel: string;
  machine: string;
};

export type MachinesSnapshot = {
  machines: MachineRow[];
  pending: MachineJob[];
  jobs: MachineJob[];
  online: number;
  total: number;
};

/** "Lid closed · on power · 80%" from the worker's typed readings. */
export function machineReadings(info: Record<string, unknown> | null): string {
  if (!info) return "";
  const parts: string[] = [];
  if (typeof info.lid_closed === "boolean") parts.push(info.lid_closed ? "Lid closed" : "Lid open");
  if (typeof info.on_ac === "boolean") parts.push(info.on_ac ? "on power" : "on battery");
  const pct = num(info.battery_pct);
  if (pct != null) parts.push(`${pct}%`);
  if (info.thermal === "serious" || info.thermal === "critical") parts.push("running hot");
  return parts.join(" · ");
}

function job(value: unknown): MachineJob | null {
  const row = rec(value);
  if (!row) return null;
  const id = str(row.id);
  if (!id) return null;
  return {
    id,
    title: str(row.title) || str(row.task) || "Job",
    status: str(row.status),
    statusLabel: str(row.status_label) || str(row.status),
    machine: str(row.claimed_by) || str(row.machine),
  };
}

export function parseMachines(body: unknown): MachinesSnapshot {
  const root = rec(body) || {};
  const machines: MachineRow[] = [];
  for (const item of arr(root.machines)) {
    const row = rec(item);
    if (!row) continue;
    const name = str(row.name);
    if (!name) continue;
    const current = rec(row.current_job);
    machines.push({
      name,
      label: str(row.label) || name,
      os: str(row.os),
      online: bool(row.online),
      state: str(row.state) || (bool(row.online) ? "idle" : "offline"),
      stateLabel: str(row.state_label) || str(row.state) || (bool(row.online) ? "Ready" : "Offline"),
      isServer: bool(row.is_server),
      currentJob: current ? str(current.title) || str(current.task) : "",
      readings: machineReadings(rec(row.info)),
    });
  }
  const pending = arr(root.pending).map(job).filter((j): j is MachineJob => j != null);
  const jobs = arr(root.jobs).map(job).filter((j): j is MachineJob => j != null);
  return { machines, pending, jobs, online: machines.filter((m) => m.online).length, total: machines.length };
}

export function machineTone(row: Pick<MachineRow, "online" | "state">): Tone {
  if (!row.online) return "muted";
  if (row.state === "busy") return "accent";
  if (row.state === "paused" || row.state === "gaming" || row.state === "hot") return "warn";
  return "ok";
}

export function machineIcon(row: Pick<MachineRow, "os" | "isServer">): "machines" | "laptop" | "monitor" {
  if (row.isServer) return "machines";
  if (/mac|darwin/i.test(row.os)) return "laptop";
  return "monitor";
}
