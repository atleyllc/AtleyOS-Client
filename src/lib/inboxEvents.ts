/** Inbox listeners. Transport and storage stay outside this file. */

const listeners = new Set<() => void>();

export function onInboxChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitInboxChanged(): void {
  for (const listener of listeners) listener();
}
