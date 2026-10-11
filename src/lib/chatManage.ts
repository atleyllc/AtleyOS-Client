/**
 * Chat list and management against home (/api/client/conversations).
 * Older homes answer 404 for these; callers fall back to the plain list.
 */
import { ApiError, apiFetch } from "./api";
import { parseChatRows, type ChatRow } from "./chatList";

export { friendlyChatError, groupChats, parseChatRows, type ChatRow } from "./chatList";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function missing(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 405 || error.status === 501);
}

export async function listChats(opts: { q?: string; archived?: boolean } = {}): Promise<ChatRow[] | null> {
  const params = new URLSearchParams({ lite: "1" });
  if (opts.q?.trim()) params.set("q", opts.q.trim());
  if (opts.archived) params.set("archived", "1");
  try {
    return parseChatRows(await apiFetch(`/api/client/conversations?${params.toString()}`));
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
}

async function post(id: string, action: string, body: Record<string, unknown>) {
  try {
    return await apiFetch<Record<string, unknown>>(
      `/api/client/conversations/${encodeURIComponent(id)}/${action}`,
      { method: "POST", body: JSON.stringify(body) },
    );
  } catch (error) {
    if (missing(error)) throw new Error("This home server can’t do that from the phone yet. Update AtleyOS at home.");
    throw error;
  }
}

export const renameChat = (id: string, title: string) => post(id, "rename", { title });
export const pinChat = (id: string, pinned: boolean) => post(id, "pin", { pinned });
export const archiveChat = (id: string, archived: boolean) => post(id, "archive", { archived });
/** Deletes the chat and its attachments at home. Ask first. */
export const deleteChat = (id: string) => post(id, "delete", { confirm: true });

/** Removes the Owner message `messageId` and everything after it. Returns its text for Edit. */
export async function truncateChat(id: string, messageId: string): Promise<{ text: string; attachmentIds: string[] }> {
  const out = await post(id, "truncate", { message_id: messageId });
  const ids = Array.isArray(out.attachment_ids) ? out.attachment_ids.filter((v): v is string => typeof v === "string") : [];
  return { text: str(out.text), attachmentIds: ids };
}

export async function exportChat(id: string): Promise<string> {
  const out = await apiFetch<unknown>(`/api/client/conversations/${encodeURIComponent(id)}/export`);
  if (typeof out === "string") return out;
  const rec = record(out);
  return rec ? str(rec.markdown) || str(rec.text) : "";
}

