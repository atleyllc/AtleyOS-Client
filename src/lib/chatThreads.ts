export type ThreadMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type LocalThread = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ThreadMessage[];
  /** Server id from a stream chunk. The phone stores it and does not send it back. */
  conversationId?: string | null;
};

export function threadTitle(messages: { role: string; content: string }[]): string {
  const first = messages.find((message) => message.role === "user")?.content.replace(/\s+/g, " ").trim();
  if (!first) return "Chat";
  return first.length > 48 ? `${first.slice(0, 48)}…` : first;
}

export function upsertThread(threads: LocalThread[], thread: LocalThread, limit = 30): LocalThread[] {
  return [thread, ...threads.filter((item) => item.id !== thread.id)].slice(0, limit);
}
