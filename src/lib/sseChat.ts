/** OpenAI-style chat stream parsing. Transport stays in the API client. */

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

/** Reduce a partial or finished stream body to the assistant text so far. */
export function reduceChatStream(buffer: string, final: boolean): { content: string; streamed: boolean } {
  const { events, rest } = takeSseEvents(buffer);
  let content = "";
  let streamed = false;
  for (const event of events) {
    const delta = interpretSseData(event);
    if (!delta || delta.kind === "done") continue;
    content = applySseDelta(content, delta);
    streamed = true;
  }
  if (!streamed && (final || rest.trim().startsWith("{"))) {
    const candidate = (rest.trim() || buffer.trim());
    if (candidate.startsWith("{")) {
      try {
        const text = contentFromChatJson(JSON.parse(candidate));
        if (text != null) return { content: text, streamed: false };
      } catch {
        /* not a single JSON body */
      }
    }
  }
  return { content, streamed };
}
