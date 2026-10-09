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

/**
 * Local notice. Title and body match the server push.
 * `data` is only the opaque id. Details come from GET /api/client/approvals.
 */
export async function notifyApprovalWaiting(id: string): Promise<void> {
  if (!id) return;
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
      body: "Something is waiting.",
      data: { id },
    },
    trigger: null,
  });
}
