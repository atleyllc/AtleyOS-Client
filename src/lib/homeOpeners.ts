import { Linking, Platform } from "react-native";
import type { HomeApp } from "./types";
import { homeOpeners } from "./api";

export async function loadHomeApps(): Promise<HomeApp[]> {
  const out = await homeOpeners();
  return out.apps || [];
}

/** Prefer native app scheme; else open overlay URL, then LAN URL. */
export async function openHomeApp(app: HomeApp): Promise<"native" | "overlay" | "lan" | "store"> {
  for (const scheme of app.native_schemes || []) {
    try {
      const can = await Linking.canOpenURL(scheme);
      if (can) {
        await Linking.openURL(scheme);
        return "native";
      }
    } catch {
      /* try next */
    }
  }
  try {
    await Linking.openURL(app.overlay_url);
    return "overlay";
  } catch {
    /* fall through */
  }
  try {
    await Linking.openURL(app.lan_url);
    return "lan";
  } catch {
    /* fall through */
  }
  const store =
    Platform.OS === "ios" ? app.store?.ios : app.store?.android;
  if (store) {
    await Linking.openURL(store);
    return "store";
  }
  throw new Error("cannot_open_app");
}

/** Open a citation / deep link from Chat (Immich asset, etc.). */
export async function openCitationUrl(url: string): Promise<void> {
  const can = await Linking.canOpenURL(url);
  if (!can) throw new Error("cannot_open_url");
  await Linking.openURL(url);
}
