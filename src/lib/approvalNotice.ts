import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { isQuietAt, noticeTitle, type InboxKind } from "./inbox";
import { loadQuietHours } from "./quietStore";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let channelReady: Promise<void> | null = null;

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  if (!channelReady) {
    channelReady = Notifications.setNotificationChannelAsync("approvals", {
      name: "AtleyOS",
      importance: Notifications.AndroidImportance.DEFAULT,
    }).then(() => undefined);
  }
  await channelReady;
}

async function allowedToShow(): Promise<boolean> {
  const quiet = await loadQuietHours();
  return !isQuietAt(quiet, new Date());
}

/**
 * Local notice. The shade stays generic.
 * `data` is only the opaque id and kind. Details stay in the inbox.
 */
export async function notifyApprovalWaiting(id: string): Promise<void> {
  await notifyInboxKind("approval", id);
}

export async function notifyInboxKind(kind: InboxKind, id: string): Promise<void> {
  if (!id) return;
  if (!(await allowedToShow())) return;
  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== "granted") {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== "granted") return;
  await ensureChannel();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "AtleyOS",
      body: noticeTitle(kind),
      data: { id, kind },
    },
    trigger: null,
  });
}
