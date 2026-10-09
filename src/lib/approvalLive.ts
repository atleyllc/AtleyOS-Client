import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import {
  approvalIdFromPushData,
  emitApprovalsChanged,
  setApprovalEventsConnected,
} from "./approvalEvents";
import { notifyApprovalWaiting } from "./approvalNotice";
import { pollApprovalsOnce } from "./approvalWatch";
import { fetchApprovals, loadSeenApprovalIds, rememberApprovalIds } from "./approvals";
import { ApiError, apiFetch, clientStatus, subscribeClientEvents } from "./api";
import { isExpoPushToken, pushRegisterBody, readApprovalPushEnabled } from "./pushGate";
import { loadSession } from "./session";

const PUSH_KEY = "atleyos.client.push.registered.v1";

async function loadRegisteredToken(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(PUSH_KEY)) || "";
  } catch {
    return "";
  }
}

async function storeRegisteredToken(token: string): Promise<void> {
  try {
    if (token) await AsyncStorage.setItem(PUSH_KEY, token);
    else await AsyncStorage.removeItem(PUSH_KEY);
  } catch {
    /* the next status check can try again */
  }
}

function missing(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 405 || error.status === 501);
}

async function postPushToken(token: string): Promise<void> {
  const platform = Platform.OS === "ios" ? "ios" : "android";
  await apiFetch("/api/client/push/register", {
    method: "POST",
    body: JSON.stringify(pushRegisterBody(token, platform)),
  });
}

/**
 * Register only after the Owner turns Approval push on.
 * An empty token clears a token this phone already registered.
 * SSE does not depend on this switch.
 */
export async function syncApprovalPush(): Promise<void> {
  const session = await loadSession();
  if (!session) return;
  let enabled = false;
  try {
    enabled = readApprovalPushEnabled(await clientStatus());
  } catch (error) {
    if (missing(error)) return;
    return;
  }
  const previous = await loadRegisteredToken();
  if (!enabled) {
    if (!previous) return;
    try {
      await postPushToken("");
      await storeRegisteredToken("");
    } catch (error) {
      if (missing(error)) await storeRegisteredToken("");
    }
    return;
  }
  let token = "";
  try {
    const current = await Notifications.getPermissionsAsync();
    let granted = current.status === "granted";
    if (!granted) {
      granted = (await Notifications.requestPermissionsAsync()).status === "granted";
    }
    if (!granted) return;
    const expo = await Notifications.getExpoPushTokenAsync();
    token = expo.data;
  } catch {
    return;
  }
  if (!isExpoPushToken(token) || token === previous) return;
  try {
    await postPushToken(token);
    await storeRegisteredToken(token);
  } catch (error) {
    if (missing(error)) return;
  }
}

async function handleApprovalSignal(id: string, notify: boolean): Promise<void> {
  let items: { id: string }[] = [];
  try {
    const next = await fetchApprovals();
    if (next.supported) items = next.items;
  } catch {
    /* the screen will show the error on its own refresh */
  }
  emitApprovalsChanged();
  const seen = await loadSeenApprovalIds();
  if (notify && seen.initialized && id && !seen.ids.includes(id)) {
    await notifyApprovalWaiting(id);
  }
  const ids = items.map((item) => item.id);
  if (id) ids.push(id);
  if (ids.length) await rememberApprovalIds(ids);
}

/** SSE while the process is open, plus push registration when the Owner switch is on. */
export function startApprovalLive(): { stop: () => void } {
  let stopped = false;
  setApprovalEventsConnected(false);
  const stream = subscribeClientEvents({
    onEvent: (event) => {
      if (event.kind === "ready") setApprovalEventsConnected(true);
      if (event.kind === "approval") {
        setApprovalEventsConnected(true);
        void handleApprovalSignal(event.id, true).catch(() => undefined);
      }
    },
    onUnsupported: () => setApprovalEventsConnected(false),
    onDown: () => setApprovalEventsConnected(false),
  });
  void pollApprovalsOnce().catch(() => undefined);
  void syncApprovalPush().catch(() => undefined);
  const pollTimer = setInterval(() => {
    void pollApprovalsOnce().catch(() => undefined);
  }, 30_000);
  const pushTimer = setInterval(() => {
    void syncApprovalPush().catch(() => undefined);
  }, 5 * 60_000);
  const received = Notifications.addNotificationReceivedListener((notification) => {
    const id = approvalIdFromPushData(notification.request.content.data);
    if (id) void handleApprovalSignal(id, false).catch(() => undefined);
  });
  const response = Notifications.addNotificationResponseReceivedListener((event) => {
    const id = approvalIdFromPushData(event.notification.request.content.data);
    if (id) void handleApprovalSignal(id, false).catch(() => undefined);
  });
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      setApprovalEventsConnected(false);
      stream.close();
      clearInterval(pollTimer);
      clearInterval(pushTimer);
      received.remove();
      response.remove();
    },
  };
}
