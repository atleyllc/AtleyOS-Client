import { unseenApprovalIds } from "./approvalList";
import { notifyApprovalWaiting } from "./approvalNotice";
import { fetchApprovals, loadSeenApprovalIds, rememberApprovalIds } from "./approvals";
import { loadSession } from "./session";

/** Poll while the app is open. The first sight of a list does not notify. */
export async function pollApprovalsOnce(): Promise<void> {
  const session = await loadSession();
  if (!session) return;
  const { supported, items } = await fetchApprovals();
  if (!supported) return;
  const seen = await loadSeenApprovalIds();
  const fresh = unseenApprovalIds(seen.ids, items);
  if (seen.initialized && fresh.length) {
    await notifyApprovalWaiting(fresh.length);
  }
  await rememberApprovalIds(items.map((item) => item.id));
}
