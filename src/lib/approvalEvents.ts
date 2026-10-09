/** Approval SSE frames from GET /api/client/events. Transport stays in the API client. */

export type ApprovalStreamEvent =
  | { kind: "ready" }
  | { kind: "approval"; id: string }
  | { kind: "ping" };

let eventsConnected = false;
const listeners = new Set<() => void>();

export function onApprovalsChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitApprovalsChanged(): void {
  for (const listener of listeners) listener();
}

export function setApprovalEventsConnected(value: boolean): void {
  eventsConnected = value;
}

export function approvalEventsAreConnected(): boolean {
  return eventsConnected;
}

export function takeApprovalEvents(buffer: string): {
  events: ApprovalStreamEvent[];
  rest: string;
} {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  const rest = parts.pop() ?? "";
  const events: ApprovalStreamEvent[] = [];
  for (const part of parts) {
    const event = parseApprovalFrame(part);
    if (event) events.push(event);
  }
  return { events, rest };
}

export function parseApprovalFrame(frame: string): ApprovalStreamEvent | null {
  let eventName = "";
  const data: string[] = [];
  let comment = false;
  for (const line of frame.split("\n")) {
    if (!line) continue;
    if (line.startsWith(":")) {
      comment = true;
      continue;
    }
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
  }
  const payload = data.join("\n").trim();
  if (eventName === "approval") {
    const id = idFromPayload(payload);
    return id ? { kind: "approval", id } : null;
  }
  if (eventName === "ready") return { kind: "ready" };
  if (comment && !eventName && !payload) return { kind: "ping" };
  return null;
}

function idFromPayload(payload: string): string {
  if (!payload) return "";
  try {
    const json = JSON.parse(payload) as { id?: unknown };
    return typeof json.id === "string" ? json.id.trim() : "";
  } catch {
    return "";
  }
}

/** Push `data` is only `{id}`. Title and summary stay on GET /api/client/approvals. */
export function approvalIdFromPushData(data: unknown): string {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "";
  const id = (data as { id?: unknown }).id;
  return typeof id === "string" ? id.trim() : "";
}
