import { approvalEventsAreConnected } from "./approvalEvents";
import { unseenApprovalIds } from "./approvalList";
import { notifyApprovalWaiting } from "./approvalNotice";
import { fetchApprovals, loadSeenApprovalIds, rememberApprovalIds } from "./approvals";
import { loadSession } from "./session";

/** Poll while the app is open and the server has no event stream. The first sight does not notify. */
export async function pollApprovalsOnce(): Promise<void> {
  if (approvalEventsAreConnected()) return;
  const session = await loadSession();
  if (!session) return;
  const { supported, items } = await fetchApprovals();
  if (!supported) return;
  const seen = await loadSeenApprovalIds();
  const fresh = unseenApprovalIds(seen.ids, items);
  if (seen.initialized) {
    for (const id of fresh) await notifyApprovalWaiting(id);
  }
  await rememberApprovalIds(items.map((item) => item.id));
}
