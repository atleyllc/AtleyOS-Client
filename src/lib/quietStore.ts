import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_QUIET, parseQuietHours, type QuietHours } from "./inbox";

const KEY = "atleyos.client.quiet.v1";

export async function loadQuietHours(): Promise<QuietHours> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_QUIET };
    return parseQuietHours(JSON.parse(raw) as unknown) || { ...DEFAULT_QUIET };
  } catch {
    return { ...DEFAULT_QUIET };
  }
}

export async function saveQuietHours(quiet: QuietHours): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(quiet));
}
