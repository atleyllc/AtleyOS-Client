import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

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
      name: "Approvals",
      importance: Notifications.AndroidImportance.DEFAULT,
    }).then(() => undefined);
  }
  await channelReady;
}

/** Local notice only. The body is a count, never the approval text. */
export async function notifyApprovalWaiting(count: number): Promise<void> {
  if (count < 1) return;
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
      body:
        count === 1
          ? "Something at home needs a decision."
          : `${count} things at home need a decision.`,
      data: { kind: "approval" },
    },
    trigger: null,
  });
}
