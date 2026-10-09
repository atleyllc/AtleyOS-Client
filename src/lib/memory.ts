import { ApiError, apiFetch } from "./api";
import { parseMemory, type MemoryItem } from "./memoryList";

export type { MemoryItem };

function missing(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 405 || error.status === 501);
}

export async function fetchMemory(): Promise<{ supported: boolean; items: MemoryItem[] }> {
  try {
    const body = await apiFetch<unknown>("/api/client/memory");
    return parseMemory(body);
  } catch (error) {
    if (missing(error)) return { supported: false, items: [] };
    throw error;
  }
}

export async function addMemory(text: string): Promise<void> {
  await apiFetch("/api/client/memory", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export async function forgetMemory(id: string): Promise<void> {
  try {
    await apiFetch("/api/client/memory/forget", {
      method: "POST",
      body: JSON.stringify({ id }),
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      await apiFetch(`/api/client/memory/${encodeURIComponent(id)}`, { method: "DELETE", body: "{}" });
      return;
    }
    throw error;
  }
}
