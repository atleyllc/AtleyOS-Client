/** GET /api/client/ai-usage: spending and tokens across local models, Cursor, OpenAI, Claude, and Grok. */
import { arr, num, rec, str } from "./parse";

export type UsageSource = {
  id: string;
  title: string;
  status: "ok" | "error" | "not_connected" | string;
  spendUsd: number | null;
  outputTokens: number | null;
  error: string;
};

export type UsageSnapshot = {
  days: number;
  apiSpendUsd: number | null;
  plansMonthlyUsd: number | null;
  localOutputTokens: number | null;
  sources: UsageSource[];
  plans: Array<{ label: string; monthlyUsd: number | null }>;
  recommendations: Array<{ title: string; body: string }>;
};

function sumOrNull(values: Array<number | null>): number | null {
  const real = values.filter((v): v is number => v != null);
  return real.length ? real.reduce((a, b) => a + b, 0) : null;
}

export function parseUsage(body: unknown): UsageSnapshot {
  const root = rec(body) || {};
  const totals = rec(root.totals) || {};
  const sources: UsageSource[] = [];
  for (const item of arr(root.sources)) {
    const row = rec(item);
    if (!row) continue;
    const id = str(row.id);
    if (!id) continue;
    const accounts = arr(row.accounts).map(rec).filter((a): a is Record<string, unknown> => a != null);
    sources.push({
      id,
      title: str(row.title) || id,
      status: str(row.status) || "ok",
      spendUsd: sumOrNull(accounts.map((a) => num(a.spend_usd))),
      outputTokens: sumOrNull(accounts.map((a) => num(a.output_tokens))),
      error: accounts.map((a) => str(a.error)).find(Boolean) || "",
    });
  }
  const plans = arr(root.plans)
    .map(rec)
    .filter((p): p is Record<string, unknown> => p != null)
    .map((p) => ({ label: str(p.label) || str(p.id), monthlyUsd: num(p.monthly_usd) }))
    .filter((p) => p.label);
  const recommendations = arr(root.recommendations)
    .map((r) => (typeof r === "string" ? { title: r, body: "" } : rec(r)))
    .filter((r): r is Record<string, unknown> => r != null)
    .map((r) => ({ title: str(r.title) || str(r.text) || str(r.message), body: str(r.body) || str(r.detail) }))
    .filter((r) => r.title);
  return {
    days: num(root.days) ?? 30,
    apiSpendUsd: num(totals.api_spend_usd),
    plansMonthlyUsd: num(totals.plans_monthly_usd),
    localOutputTokens: num(totals.local_output_tokens),
    sources,
    plans,
    recommendations,
  };
}

export function formatUsd(value: number | null): string {
  if (value == null) return "—";
  return `$${value.toFixed(value >= 100 ? 0 : 2)}`;
}

export function formatTokens(value: number | null): string {
  if (value == null) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}
