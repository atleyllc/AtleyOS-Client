/**
 * Open the phone app that goes with a home app (Immich, Nextcloud, Jellyfin,
 * Home Assistant). Android launches by package; iOS by URL scheme.
 * Both need the app declared (Android <queries>, iOS LSApplicationQueriesSchemes),
 * which plugins/withHomeAppQueries.js does.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as IntentLauncher from "expo-intent-launcher";
import { Linking, Platform } from "react-native";
import type { OpenTarget } from "./awayApps";

const PREF_KEY = "atleyos.client.homeapp.open.v1";

export async function isAppInstalled(androidPackage?: string, iosScheme?: string): Promise<boolean> {
  try {
    if (Platform.OS === "android" && androidPackage) {
      await IntentLauncher.getApplicationIconAsync(androidPackage);
      return true;
    }
    if (Platform.OS === "ios" && iosScheme) return await Linking.canOpenURL(iosScheme);
  } catch {
    return false;
  }
  return false;
}

export async function launchApp(androidPackage?: string, iosScheme?: string): Promise<boolean> {
  try {
    if (Platform.OS === "android" && androidPackage) {
      IntentLauncher.openApplication(androidPackage);
      return true;
    }
    if (Platform.OS === "ios" && iosScheme) {
      await Linking.openURL(iosScheme);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

async function loadPrefs(): Promise<Record<string, OpenTarget>> {
  try {
    const raw = await AsyncStorage.getItem(PREF_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, OpenTarget>) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Phone app by default; the Owner can switch one app to the browser. */
export async function openPreference(kind: string): Promise<OpenTarget> {
  const prefs = await loadPrefs();
  return prefs[kind] === "browser" ? "browser" : "native";
}

export async function setOpenPreference(kind: string, target: OpenTarget): Promise<void> {
  const prefs = await loadPrefs();
  prefs[kind] = target;
  await AsyncStorage.setItem(PREF_KEY, JSON.stringify(prefs));
}
