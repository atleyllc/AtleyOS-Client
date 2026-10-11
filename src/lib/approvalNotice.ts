import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { isQuietAt, noticeLines, noticeTitle, type InboxItem, type InboxKind } from "./inbox";
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
 * Local notice. Home-written alerts show their real title and one-line reason
 * (see `noticeLines`); reminders and routines stay generic in the shade.
 * `data` is only the opaque id and kind.
 */
export async function notifyApprovalWaiting(id: string): Promise<void> {
  await notifyInboxKind("approval", id);
}

export async function notifyInboxKind(kind: InboxKind, id: string): Promise<void> {
  await showNotice({ id, kind }, { title: "AtleyOS", body: noticeTitle(kind) });
}

export async function notifyInboxItem(item: InboxItem): Promise<void> {
  await showNotice({ id: item.id, kind: item.kind }, noticeLines(item));
}

async function showNotice(data: { id: string; kind: InboxKind }, lines: { title: string; body: string }): Promise<void> {
  if (!data.id) return;
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
      title: lines.title,
      body: lines.body,
      data: { id: data.id, kind: data.kind },
    },
    trigger: null,
  });
}
