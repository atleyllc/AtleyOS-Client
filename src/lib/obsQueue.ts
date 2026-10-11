/**
 * Pure helpers for the phone → home observation queue.
 *
 * Each sync collects contacts, calendar, location, and photo details again.
 * Before 1.2.1 every pass was appended, so the queue grew by the whole
 * collection each time Chat opened while only 100 items uploaded, which is
 * how "Pending 1050" kept climbing. Items are now keyed and de-duplicated.
 */
export type QueueItem = {
  source_class: string;
  title: string;
  body?: string;
  external_id?: string;
  occurred_at?: number;
};

export const QUEUE_CAP = 5000;

export function queueKey(item: QueueItem): string {
  if (item.external_id) return `${item.source_class}|id|${item.external_id}`;
  return `${item.source_class}|${item.title}|${item.body ?? ""}|${item.occurred_at ?? ""}`;
}

/** Queue plus new items, newest copy wins, oldest dropped past the cap. */
export function mergeQueue<T extends QueueItem>(queue: T[], incoming: T[], cap = QUEUE_CAP): T[] {
  const map = new Map<string, T>();
  for (const item of [...queue, ...incoming]) {
    const key = queueKey(item);
    if (map.has(key)) map.delete(key);
    map.set(key, item);
  }
  const merged = [...map.values()];
  return merged.length > cap ? merged.slice(merged.length - cap) : merged;
}
