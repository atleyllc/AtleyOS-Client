/**
 * Assistant tool calls and file-search citations.
 * Deletes show a plain summary, an undo note, and need a second confirm.
 */

import { citationsFromUnknown, type SearchHit } from "./searchParse";

export type ToolCallView = {
  id: string;
  name: string;
  summary: string;
  approvalId: string;
  undoNote: string;
  isDelete: boolean;
};

export type ChatExtras = {
  toolCalls: ToolCallView[];
  citations: SearchHit[];
  embeddingRoute: string;
};

export const EMPTY_EXTRAS: ChatExtras = { toolCalls: [], citations: [], embeddingRoute: "" };

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function argsRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return record(parsed) || {};
    } catch {
      return {};
    }
  }
  return record(value) || {};
}

export function plainToolSummary(name: string, args: Record<string, unknown>): string {
  const given = text(args.summary) || text(args.description);
  if (given) return given;
  const path = text(args.path) || text(args.file);
  const file = path.split("/").filter(Boolean).pop() || "";
  const label = name.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  const titled = label ? label.charAt(0).toUpperCase() + label.slice(1) : "Home wants to use a tool";
  if (/delete|erase|remove/i.test(name) && file) return `Delete ${file}`;
  if (file) return `${titled} · ${file}`;
  return titled;
}

export function isDeleteTool(name: string, args: Record<string, unknown>): boolean {
  if (args.destructive === true || args.confirm === true && /delete|erase|remove/i.test(name)) return true;
  if (text(args.action).toLowerCase() === "delete") return true;
  return /delete|erase|remove/i.test(name);
}

function toolFromRow(row: Record<string, unknown>, index: number): ToolCallView | null {
  const fn = record(row.function) || row;
  const name = text(fn.name) || text(row.name) || text(row.tool);
  if (!name && !text(row.id)) return null;
  const args = argsRecord(fn.arguments ?? row.arguments ?? row.args ?? row.input);
  const id = text(row.id) || text(row.tool_call_id) || `tool-${index}`;
  return {
    id,
    name: name || "tool",
    summary: plainToolSummary(name || "tool", args),
    approvalId: text(row.approval_id) || text(args.approval_id) || text(row.approvalId),
    undoNote: text(row.undo) || text(row.undo_note) || text(args.undo) || text(args.undo_note),
    isDelete: isDeleteTool(name, args) || row.destructive === true,
  };
}

type PartialTool = {
  index: number;
  id: string;
  name: string;
  args: string;
  approvalId: string;
  summary: string;
  undoNote: string;
  isDelete: boolean;
};

export function mergeToolDelta(current: PartialTool[], delta: unknown): PartialTool[] {
  if (!Array.isArray(delta)) return current;
  const next = current.map((item) => ({ ...item }));
  for (const item of delta) {
    const row = record(item);
    if (!row) continue;
    const index = typeof row.index === "number" ? row.index : next.length;
    const fn = record(row.function);
    const found = next.find((entry) => entry.index === index);
    const entry: PartialTool = found || {
      index,
      id: "",
      name: "",
      args: "",
      approvalId: "",
      summary: "",
      undoNote: "",
      isDelete: false,
    };
    if (!found) next.push(entry);
    if (text(row.id)) entry.id = text(row.id);
    if (fn && text(fn.name)) entry.name = text(fn.name);
    if (fn && typeof fn.arguments === "string") entry.args += fn.arguments;
    if (text(row.approval_id)) entry.approvalId = text(row.approval_id);
    if (text(row.undo) || text(row.undo_note)) entry.undoNote = text(row.undo) || text(row.undo_note);
    if (text(row.summary)) entry.summary = text(row.summary);
  }
  return next;
}

export function finishToolCalls(partials: PartialTool[]): ToolCallView[] {
  return partials
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((entry, index) => {
      const args = argsRecord(entry.args);
      const name = entry.name || "tool";
      return {
        id: entry.id || `tool-${index}`,
        name,
        summary: entry.summary || plainToolSummary(name, args),
        approvalId: entry.approvalId || text(args.approval_id),
        undoNote: entry.undoNote || text(args.undo) || text(args.undo_note),
        isDelete: entry.isDelete || isDeleteTool(name, args),
      };
    });
}

export function extrasFromChatJson(json: unknown): ChatExtras {
  const root = record(json);
  if (!root) return EMPTY_EXTRAS;
  const choice = Array.isArray(root.choices) ? record(root.choices[0]) : null;
  const message = choice ? record(choice.message) : null;
  const delta = choice ? record(choice.delta) : null;
  const bags = [root, message, delta].filter((item): item is Record<string, unknown> => !!item);
  const rows: unknown[] = [];
  for (const bag of bags) {
    for (const key of ["tool_calls", "toolCalls", "tools"]) {
      if (Array.isArray(bag[key])) rows.push(...(bag[key] as unknown[]));
    }
  }
  const toolCalls: ToolCallView[] = [];
  rows.forEach((item, index) => {
    const row = record(item);
    if (!row) return;
    const tool = toolFromRow(row, index);
    if (tool) toolCalls.push(tool);
  });
  let citations: SearchHit[] = [];
  for (const bag of bags) {
    const found = citationsFromUnknown(bag.citations ?? bag.sources ?? bag.results);
    if (found.length) citations = found;
  }
  const embeddingRoute =
    text(root.embedding_route) ||
    (message ? text(message.embedding_route) : "") ||
    (delta ? text(delta.embedding_route) : "");
  return { toolCalls, citations, embeddingRoute };
}

export type StreamCarry = {
  partials: PartialTool[];
  citations: SearchHit[];
  embeddingRoute: string;
  finished: ToolCallView[];
};

export function emptyStreamCarry(): StreamCarry {
  return { partials: [], citations: [], embeddingRoute: "", finished: [] };
}

/** Fold one chat JSON object into the extras gathered so far. */
export function absorbStreamJson(carry: StreamCarry, json: unknown): StreamCarry {
  const extras = extrasFromChatJson(json);
  const root = record(json);
  const choice = root && Array.isArray(root.choices) ? record(root.choices[0]) : null;
  const delta = choice ? record(choice.delta) : null;
  const deltaTools = delta && Array.isArray(delta.tool_calls) ? delta.tool_calls : null;
  return {
    partials: deltaTools ? mergeToolDelta(carry.partials, deltaTools) : carry.partials,
    citations: extras.citations.length ? extras.citations : carry.citations,
    embeddingRoute: extras.embeddingRoute || carry.embeddingRoute,
    finished: !deltaTools && extras.toolCalls.length ? extras.toolCalls : carry.finished,
  };
}

export function extrasFromCarry(carry: StreamCarry): ChatExtras {
  return {
    toolCalls: carry.partials.length ? finishToolCalls(carry.partials) : carry.finished,
    citations: carry.citations,
    embeddingRoute: carry.embeddingRoute,
  };
}

export function deleteConfirmCopy(tool: Pick<ToolCallView, "summary" | "undoNote">): {
  title: string;
  message: string;
} {
  const undo = tool.undoNote ? ` ${tool.undoNote}` : " You can undo a delete from the home dashboard.";
  return {
    title: "Confirm delete",
    message: `${tool.summary || "This deletes something."} Allowing it deletes it.${undo} Confirm again to allow it.`,
  };
}
