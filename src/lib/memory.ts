import { ApiError, apiFetch } from "./api";
import { memoryErrorCopy, parseMemory, validateMemoryText, type MemoryItem } from "./memoryList";

export type { MemoryItem };

function missing(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 405 || error.status === 501);
}

function explainMemoryError(error: unknown): never {
  if (error instanceof ApiError) {
    const body = error.body;
    const code =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : error.message;
    const copy = memoryErrorCopy(code);
    if (copy) throw new ApiError(copy, error.status, error.body);
  }
  throw error;
}

export async function fetchMemory(): Promise<{ supported: boolean; items: MemoryItem[] }> {
  try {
    const body = await apiFetch<unknown>("/api/client/memory");
    return parseMemory(body);
  } catch (error) {
    if (missing(error)) return { supported: false, items: [] };
    throw explainMemoryError(error);
  }
}

export async function addMemory(text: string): Promise<void> {
  const problem = validateMemoryText(text);
  if (problem) throw new Error(memoryErrorCopy(problem));
  try {
    await apiFetch("/api/client/memory", {
      method: "POST",
      body: JSON.stringify({ text: text.trim() }),
    });
  } catch (error) {
    explainMemoryError(error);
  }
}

/** Forget is POST only. 404 means that id is unknown — do not call DELETE. */
export async function forgetMemory(id: string): Promise<void> {
  if (!id.trim()) throw new Error(memoryErrorCopy("missing_id"));
  try {
    await apiFetch("/api/client/memory/forget", {
      method: "POST",
      body: JSON.stringify({ id }),
    });
  } catch (error) {
    explainMemoryError(error);
  }
}
