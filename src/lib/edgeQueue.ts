/**
 * Shared edge activity queue helpers (mobile + future browser extension).
 * See docs/EDGE_ACTIVITY_QUEUE.md
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

export const EDGE_QUEUE_SCHEMA = 1;
export const EDGE_QUEUE_KEY = "atleyos.client.edge.activity.queue.v1";

export type EdgeCollector = "android_client" | "ios_client" | "browser_ext";

export type EdgeActivityItem = {
  schema_version: number;
  device_id?: string;
  source: EdgeCollector;
  source_class: string;
  title: string;
  body?: string;
  occurred_at: number;
  external_id?: string;
  metadata?: Record<string, unknown>;
  status: "queued" | "sending" | "acked";
};

export async function loadEdgeQueue(): Promise<EdgeActivityItem[]> {
  try {
    const raw = await AsyncStorage.getItem(EDGE_QUEUE_KEY);
    return raw ? (JSON.parse(raw) as EdgeActivityItem[]) : [];
  } catch {
    return [];
  }
}

export async function saveEdgeQueue(items: EdgeActivityItem[]): Promise<void> {
  // Cap to avoid unbounded growth
  const capped = items.slice(-2000);
  await AsyncStorage.setItem(EDGE_QUEUE_KEY, JSON.stringify(capped));
}

export function makeEdgeItem(
  partial: Omit<EdgeActivityItem, "schema_version" | "status" | "occurred_at"> & {
    occurred_at?: number;
  },
): EdgeActivityItem {
  return {
    schema_version: EDGE_QUEUE_SCHEMA,
    status: "queued",
    occurred_at: partial.occurred_at ?? Date.now() / 1000,
    ...partial,
  };
}
