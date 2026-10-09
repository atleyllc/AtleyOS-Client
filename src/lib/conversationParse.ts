import { threadTitle } from "./chatThreads";

export type ServerMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type ServerConversation = {
  id: string;
  title: string;
  updatedAt: number | null;
  messages: ServerMessage[];
};

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function firstString(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = text(obj[key]);
    if (value) return value;
  }
  return "";
}

function firstArray(obj: Record<string, unknown>, keys: string[]): unknown[] | null {
  for (const key of keys) {
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

export function parseMessages(value: unknown): ServerMessage[] {
  if (!Array.isArray(value)) return [];
  const out: ServerMessage[] = [];
  for (const item of value) {
    const rec = record(item);
    if (!rec) continue;
    const content = text(rec.content) || text(rec.text) || text(rec.body);
    if (!content) continue;
    const roleRaw = text(rec.role).toLowerCase();
    const role = roleRaw === "user" || roleRaw === "system" ? roleRaw : "assistant";
    out.push({ role, content });
  }
  return out;
}

export function parseConversation(value: unknown): ServerConversation | null {
  const root = record(value);
  if (!root) return null;
  const rec = record(root.conversation) || root;
  const nestedMessages =
    rec.messages ?? rec.turns ?? rec.history ?? rec.items ?? root.messages ?? root.turns;
  const messages = parseMessages(nestedMessages);
  const id = firstString(rec, ["id", "conversation_id", "thread_id"]);
  if (!id && messages.length === 0) return null;
  const title =
    firstString(rec, ["title", "name", "label", "summary"]) || threadTitle(messages);
  return {
    id: id || title,
    title,
    updatedAt: readTime(rec.updated_at ?? rec.updatedAt ?? rec.created_at ?? rec.createdAt),
    messages,
  };
}

export function parseConversationList(body: unknown): {
  supported: boolean;
  conversations: ServerConversation[];
} {
  const rec = record(body);
  if (!rec) return { supported: false, conversations: [] };
  const raw = firstArray(rec, ["conversations", "items", "threads", "chats", "data"]);
  if (!raw) {
    const one = parseConversation(rec);
    if (one && (one.messages.length > 0 || firstString(rec, ["id", "conversation_id"]))) {
      return { supported: true, conversations: [one] };
    }
    return { supported: false, conversations: [] };
  }
  const conversations: ServerConversation[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const conversation = parseConversation(item);
    if (!conversation || seen.has(conversation.id)) continue;
    seen.add(conversation.id);
    conversations.push(conversation);
  }
  return { supported: true, conversations };
}
