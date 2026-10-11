/** GET /api/client/storage. Erase, move, and restore stay on the dashboard. */

export type StorageDrive = {
  id: string;
  role: string;
  label: string;
  freeBytes: number | null;
  totalBytes: number | null;
  health: string;
};

export type StorageBackup = {
  status: string;
  detail: string;
  lastSuccessAt: number | null;
};

export type StorageSnapshot = {
  supported: boolean;
  health: string;
  drives: StorageDrive[];
  backup: StorageBackup | null;
};

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function bytes(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function readTime(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function firstArray(obj: Record<string, unknown>): unknown[] | null {
  for (const key of ["drives", "volumes", "disks", "pools"]) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  return null;
}

export function formatBytes(value: number | null): string {
  if (value == null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = value;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  const digits = n >= 10 || i === 0 ? 0 : 1;
  return `${n.toFixed(digits)} ${units[i]}`;
}

export function parseStorage(body: unknown): StorageSnapshot {
  const root = record(body);
  if (!root) return { supported: false, health: "", drives: [], backup: null };
  const raw = firstArray(root);
  const backupRaw = record(root.backup) || record(root.backup_status);
  if (!raw && !backupRaw && !text(root.health)) {
    return { supported: false, health: "", drives: [], backup: null };
  }
  const drives: StorageDrive[] = [];
  for (const item of raw || []) {
    const row = record(item);
    if (!row) continue;
    const role = text(row.role) || text(row.drive_role) || text(row.kind) || "drive";
    const label = text(row.label) || text(row.name) || text(row.mount) || role;
    const id = text(row.id) || label;
    drives.push({
      id,
      role,
      label,
      freeBytes: bytes(row.bytes_free ?? row.free_bytes ?? row.available_bytes ?? row.free),
      totalBytes: bytes(row.bytes_total ?? row.total_bytes ?? row.size_bytes ?? row.size),
      health: text(row.health) || text(row.status) || "",
    });
  }
  const backup: StorageBackup | null = backupRaw
    ? {
        status: text(backupRaw.status) || text(backupRaw.state) || text(root.backup_status),
        detail: text(backupRaw.detail) || text(backupRaw.message) || text(backupRaw.summary),
        lastSuccessAt: readTime(
          backupRaw.last_success_at ?? backupRaw.last_success ?? backupRaw.last_backup_at,
        ),
      }
    : text(root.backup_status)
      ? { status: text(root.backup_status), detail: "", lastSuccessAt: null }
      : null;
  return {
    supported: true,
    health: text(root.health) || text(root.status),
    drives,
    backup,
  };
}
