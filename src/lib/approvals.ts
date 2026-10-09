import AsyncStorage from "@react-native-async-storage/async-storage";
import { ApiError, apiFetch } from "./api";
import {
  approvalDecisionBody,
  parseApprovals,
  type ApprovalDecision,
  type ApprovalItem,
} from "./approvalList";

export type { ApprovalDecision, ApprovalItem };

const SEEN_KEY = "atleyos.client.approvals.seen.v1";

function missing(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 405 || error.status === 501);
}

export async function fetchApprovals(): Promise<{ supported: boolean; items: ApprovalItem[] }> {
  try {
    const body = await apiFetch<unknown>("/api/client/approvals");
    return parseApprovals(body);
  } catch (error) {
    if (missing(error)) return { supported: false, items: [] };
    throw error;
  }
}

export async function decideApproval(id: string, decision: ApprovalDecision): Promise<void> {
  const body = JSON.stringify(approvalDecisionBody(id, decision));
  try {
    await apiFetch("/api/client/approvals/decide", { method: "POST", body });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      await apiFetch(`/api/client/approvals/${encodeURIComponent(id)}/decide`, {
        method: "POST",
        body: JSON.stringify({ decision }),
      });
      return;
    }
    throw error;
  }
}

export async function loadSeenApprovalIds(): Promise<{ initialized: boolean; ids: string[] }> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    if (!raw) return { initialized: false, ids: [] };
    const parsed = JSON.parse(raw) as { initialized?: boolean; ids?: string[] };
    return {
      initialized: Boolean(parsed.initialized),
      ids: Array.isArray(parsed.ids) ? parsed.ids.filter((id) => typeof id === "string") : [],
    };
  } catch {
    return { initialized: false, ids: [] };
  }
}

export async function rememberApprovalIds(ids: string[]): Promise<void> {
  const prev = await loadSeenApprovalIds();
  const next = [...new Set([...prev.ids, ...ids])].slice(-200);
  await AsyncStorage.setItem(SEEN_KEY, JSON.stringify({ initialized: true, ids: next }));
}
