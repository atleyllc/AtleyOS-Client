import { ApiError, apiFetch } from "./api";
import { parseConversation, parseConversationList, type ServerConversation } from "./conversationParse";

function missing(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 405 || error.status === 501);
}

export async function fetchConversations(): Promise<{
  supported: boolean;
  conversations: ServerConversation[];
}> {
  try {
    const body = await apiFetch<unknown>("/api/client/conversations");
    return parseConversationList(body);
  } catch (error) {
    if (missing(error)) return { supported: false, conversations: [] };
    throw error;
  }
}

export async function fetchConversation(id: string): Promise<ServerConversation | null> {
  try {
    const body = await apiFetch<unknown>(`/api/client/conversations/${encodeURIComponent(id)}`);
    return parseConversation(body);
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
}
