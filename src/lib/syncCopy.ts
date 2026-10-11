/** Plain-language status for the phone → home learning sync on the You tab. */
import type { SyncStatus } from "./types";
import type { Tone } from "./tone";

/** flushQueue uploads this many items per pass. */
export const SYNC_BATCH = 100;

export type SyncCopy = {
  headline: string;
  detail: string;
  tone: Tone;
  chip: string;
  /** 0..1 share of the queue already uploaded in this run, or null when there is nothing to show. */
  progress: number | null;
};

export function relativeTime(ms: number | undefined, now = Date.now()): string {
  if (!ms) return "";
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

export function syncCopy(
  status: SyncStatus | null,
  opts: { now?: number; startPending?: number | null; syncing?: boolean } = {},
): SyncCopy {
  const pending = status?.pending ?? 0;
  const when = relativeTime(status?.lastSyncAt, opts.now);
  const start = opts.startPending ?? null;
  const progress = opts.syncing && start && start > 0 ? Math.max(0, Math.min(1, (start - pending) / start)) : null;
  if (opts.syncing) {
    return {
      headline: `Uploading ${pending.toLocaleString()} item${pending === 1 ? "" : "s"}…`,
      detail: `Sending to your home server ${SYNC_BATCH} at a time.`,
      tone: "accent",
      chip: "Syncing",
      progress: progress ?? 0,
    };
  }
  if (status?.lastError) {
    return {
      headline: pending ? `${pending.toLocaleString()} items waiting` : "Last sync failed",
      detail: `Couldn’t reach home: ${status.lastError}`,
      tone: "danger",
      chip: "Failed",
      progress: null,
    };
  }
  if (pending > 0) {
    const passes = Math.ceil(pending / SYNC_BATCH);
    return {
      headline: `${pending.toLocaleString()} item${pending === 1 ? "" : "s"} waiting to upload`,
      detail:
        `Contacts, calendar, and photo details this phone collected for your home server. ` +
        `They upload ${SYNC_BATCH} at a time (${passes} pass${passes === 1 ? "" : "es"} left).` +
        (when ? ` Last upload ${when}.` : ""),
      tone: "warn",
      chip: "Waiting",
      progress: null,
    };
  }
  return {
    headline: status?.lastSyncAt ? "Up to date" : "Not synced yet",
    detail: status?.lastSyncAt
      ? `Everything this phone collected is on your home server. Last upload ${when}.`
      : "Sync sends contacts, calendar, and photo details to your home server. Nothing leaves home.",
    tone: status?.lastSyncAt ? "ok" : "muted",
    chip: status?.lastSyncAt ? "Synced" : "Off",
    progress: null,
  };
}
