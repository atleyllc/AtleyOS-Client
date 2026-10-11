export type Tone = "ok" | "warn" | "danger" | "muted" | "accent";

/** Map a home app or job status word to a chip tone and short label. */
export function statusChip(status: string | null | undefined): { label: string; tone: Tone } | null {
  const s = (status || "").trim().toLowerCase();
  if (!s) return null;
  if (["up", "ok", "healthy", "running", "online", "ready"].includes(s)) return { label: "Up", tone: "ok" };
  if (["down", "stopped", "exited", "offline", "unhealthy", "error"].includes(s)) return { label: "Down", tone: "danger" };
  if (["starting", "restarting", "degraded", "paused"].includes(s)) return { label: s[0].toUpperCase() + s.slice(1), tone: "warn" };
  return { label: s[0].toUpperCase() + s.slice(1), tone: "muted" };
}
