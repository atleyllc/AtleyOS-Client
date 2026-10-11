/** OpenAI-style chat stream parsing. Transport stays in the API client. */

import { absorbStreamJson, emptyStreamCarry, extrasFromCarry, type ToolCallView } from "./chatTools";
import type { SearchHit } from "./searchParse";

export type SseDelta =
  | { kind: "append"; text: string }
  | { kind: "replace"; text: string }
  | { kind: "done" };

export function takeSseEvents(buffer: string): { events: string[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  const rest = parts.pop() ?? "";
  const events: string[] = [];
  for (const part of parts) {
    const data = part
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n")
      .trim();
    if (data) events.push(data);
  }
  return { events, rest };
}

export function chatErrorCopy(code: string): string {
  if (code === "empty_message") return "Write a message before sending.";
  if (code === "no_conversation_assignment") {
    return "Home has no conversation model selected. Pick one, then send again.";
  }
  return "";
}

export function conversationIdFromJson(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const id = (json as { conversation_id?: unknown }).conversation_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

export function interpretSseData(data: string): SseDelta | null {
  const trimmed = data.trim();
  if (!trimmed) return null;
  if (trimmed === "[DONE]") return { kind: "done" };
  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch {
    return null;
  }
  return deltaFromChatJson(json);
}

export function deltaFromChatJson(json: unknown): SseDelta | null {
  if (!json || typeof json !== "object") return null;
  const choices = (json as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return null;
  const choice = choices[0] as {
    delta?: { content?: unknown };
    message?: { content?: unknown };
  };
  if (typeof choice.delta?.content === "string" && choice.delta.content.length > 0) {
    return { kind: "append", text: choice.delta.content };
  }
  if (typeof choice.message?.content === "string") {
    return { kind: "replace", text: choice.message.content };
  }
  return null;
}

export function applySseDelta(current: string, delta: SseDelta): string {
  if (delta.kind === "done") return current;
  if (delta.kind === "replace") return delta.text;
  return current + delta.text;
}

export function contentFromChatJson(json: unknown): string | null {
  const delta = deltaFromChatJson(json);
  if (!delta || delta.kind === "done") return null;
  return delta.text;
}

export type ChatStreamReduction = {
  content: string;
  streamed: boolean;
  conversationId: string | null;
  toolCalls: ToolCallView[];
  citations: SearchHit[];
  embeddingRoute: string;
};

function rememberConversation(current: string | null, data: string): string | null {
  const trimmed = data.trim();
  if (!trimmed || trimmed === "[DONE]") return current;
  try {
    return conversationIdFromJson(JSON.parse(trimmed)) || current;
  } catch {
    return current;
  }
}

function jsonFromEvent(data: string): unknown | null {
  const trimmed = data.trim();
  if (!trimmed || trimmed === "[DONE]") return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/** Reduce a partial or finished stream body to the assistant text and extras so far. */
export function reduceChatStream(buffer: string, final: boolean): ChatStreamReduction {
  const { events, rest } = takeSseEvents(buffer);
  let content = "";
  let streamed = false;
  let conversationId: string | null = null;
  let carry = emptyStreamCarry();
  for (const event of events) {
    conversationId = rememberConversation(conversationId, event);
    const json = jsonFromEvent(event);
    if (json) carry = absorbStreamJson(carry, json);
    const delta = interpretSseData(event);
    if (!delta || delta.kind === "done") continue;
    content = applySseDelta(content, delta);
    streamed = true;
  }
  const extras = extrasFromCarry(carry);
  if (!streamed && (final || rest.trim().startsWith("{"))) {
    const candidate = rest.trim() || buffer.trim();
    if (candidate.startsWith("{")) {
      try {
        const json = JSON.parse(candidate) as unknown;
        const text = contentFromChatJson(json);
        const full = extrasFromCarry(absorbStreamJson(carry, json));
        if (text != null || full.toolCalls.length > 0 || full.citations.length > 0) {
          return {
            content: text ?? content,
            streamed: false,
            conversationId: conversationIdFromJson(json) || conversationId,
            toolCalls: full.toolCalls,
            citations: full.citations,
            embeddingRoute: full.embeddingRoute,
          };
        }
      } catch {
        /* not a single JSON body */
      }
    }
  }
  return { content, streamed, conversationId, ...extras };
}
