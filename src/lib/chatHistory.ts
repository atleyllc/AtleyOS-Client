import AsyncStorage from "@react-native-async-storage/async-storage";
import { upsertThread, type LocalThread } from "./chatThreads";

const KEY = "atleyos.client.chat.threads.v1";

export async function loadThreads(): Promise<LocalThread[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalThread[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveThread(thread: LocalThread): Promise<LocalThread[]> {
  const next = upsertThread(await loadThreads(), thread);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
