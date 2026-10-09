export type ApprovalDecision = "allow" | "deny";

export type ApprovalItem = {
  id: string;
  title: string;
  summary: string;
  createdAt: number | null;
};

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function firstArray(obj: Record<string, unknown>): unknown[] | null {
  for (const key of ["approvals", "pending", "items", "actions", "data"]) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
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

export function parseApprovals(body: unknown): { supported: boolean; items: ApprovalItem[] } {
  const rec = record(body);
  if (!rec) return { supported: false, items: [] };
  const raw = firstArray(rec);
  if (!raw) return { supported: false, items: [] };
  const items: ApprovalItem[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const row = record(item);
    if (!row) continue;
    const id = text(row.id) || text(row.approval_id) || text(row.action_id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      title: text(row.title) || text(row.name) || text(row.action) || "Needs a decision",
      summary: text(row.summary) || text(row.description) || text(row.detail) || text(row.reason),
      createdAt: readTime(row.created_at ?? row.createdAt ?? row.ts),
    });
  }
  return { supported: true, items };
}

export type DecisionResult = {
  executed: boolean | null;
  message: string;
};

export function parseDecisionResult(body: unknown): DecisionResult {
  const rec = record(body);
  if (!rec) return { executed: null, message: "" };
  return {
    executed: typeof rec.executed === "boolean" ? rec.executed : null,
    message: text(rec.message),
  };
}

export function decisionResultLine(result: DecisionResult, decision: ApprovalDecision): string {
  const lead =
    result.executed === true
      ? "Home ran it."
      : result.executed === false
        ? "Home did not run it."
        : decision === "allow"
          ? "Home recorded Allow."
          : "Home recorded Deny.";
  return result.message ? `${lead} ${result.message}` : lead;
}

export function approvalDecisionBody(
  id: string,
  decision: ApprovalDecision,
): { id: string; decision: ApprovalDecision } {
  return { id, decision };
}

/** Ids in `items` that were not in the last seeded set. */
export function unseenApprovalIds(seen: string[], items: { id: string }[]): string[] {
  const known = new Set(seen);
  return items.map((item) => item.id).filter((id) => id && !known.has(id));
}
