/** GET /api/client/coding: coding jobs started from chat, and the Cursor savings card. */
import { arr, num, rec, str } from "./parse";
import type { Tone } from "./tone";

export type CodingJob = {
  id: string;
  repo: string;
  title: string;
  status: string;
  statusLabel: string;
  phase: string;
  tier: "local" | "cursor";
  tierLabel: string;
  prUrl: string;
  prNumber: number | null;
  updatedAt: number | null;
};

export type CodingSnapshot = {
  open: CodingJob[];
  recent: CodingJob[];
  localSharePct: number | null;
  headline: string;
  planLabel: string;
  planLine: string;
};

const OPEN = new Set(["starting", "queued", "waiting_approval", "running"]);

function job(value: unknown): CodingJob | null {
  const row = rec(value);
  if (!row) return null;
  const id = str(row.id);
  if (!id) return null;
  const tier = str(row.tier) === "cursor" ? "cursor" : "local";
  return {
    id,
    repo: str(row.repo),
    title: str(row.title) || str(row.request) || "Coding job",
    status: str(row.status),
    statusLabel: str(row.status_label) || str(row.status),
    phase: str(row.phase),
    tier,
    tierLabel: str(row.tier_label) || (tier === "local" ? "Local (free)" : "Cursor"),
    prUrl: str(row.pr_url),
    prNumber: num(row.pr_number),
    updatedAt: num(row.updated_at),
  };
}

export function parseCoding(body: unknown): CodingSnapshot {
  const root = rec(body) || {};
  const open = arr(root.open).map(job).filter((j): j is CodingJob => j != null);
  const openIds = new Set(open.map((j) => j.id));
  const recent = arr(root.recent)
    .map(job)
    .filter((j): j is CodingJob => j != null && !openIds.has(j.id));
  const savings = rec(root.savings) || {};
  const plan = rec(savings.plan) || {};
  return {
    open,
    recent,
    localSharePct: num(savings.local_share_pct),
    headline: str(savings.headline),
    planLabel: str(plan.label),
    planLine: str(plan.usage_line),
  };
}

export function codingTone(job: Pick<CodingJob, "status">): Tone {
  if (job.status === "waiting_approval") return "warn";
  if (OPEN.has(job.status)) return "accent";
  if (job.status === "failed" || job.status === "error") return "danger";
  if (job.status === "cancelled") return "muted";
  return "ok";
}
