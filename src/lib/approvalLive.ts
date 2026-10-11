import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import {
  approvalIdFromPushData,
  emitApprovalsChanged,
  setApprovalEventsConnected,
} from "./approvalEvents";
import { notifyApprovalWaiting, notifyInboxKind } from "./approvalNotice";
import { pollApprovalsOnce } from "./approvalWatch";
import { fetchApprovals, loadSeenApprovalIds, rememberApprovalIds } from "./approvals";
import { ApiError, apiFetch, clientStatus, subscribeClientEvents } from "./api";
import { emitInboxChanged } from "./inboxEvents";
import { noticeFromEvent } from "./inbox";
import { rememberNotice } from "./inboxStore";
import { isExpoPushToken, pushRegisterBody } from "./pushGate";
import { readPushPlan } from "./pushMechanism";
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
 * Register Expo push when home asks this app to receive notices.
 * Another app (ntfy and the rest) is never opened.
 * An empty token clears a token this phone already registered.
 * SSE does not depend on this switch.
 */
export async function syncApprovalPush(): Promise<void> {
  const session = await loadSession();
  if (!session) return;
  let enabled = false;
  try {
    const plan = readPushPlan(await clientStatus());
    enabled = plan.enabled && plan.provider === "expo";
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

function kindFromPushData(data: unknown): string {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "";
  const kind = (data as { kind?: unknown }).kind;
  return typeof kind === "string" ? kind.trim() : "";
}

async function handleNotice(name: string, payload: unknown): Promise<void> {
  const item = noticeFromEvent(name, payload);
  if (!item) return;
  await rememberNotice(item);
  emitInboxChanged();
  await notifyInboxKind(item.kind, item.id);
}

/** SSE while the process is open, plus push registration when home enables it. */
export function startApprovalLive(): { stop: () => void; reconnect: () => void } {
  let stopped = false;
  setApprovalEventsConnected(false);
  const stream = subscribeClientEvents({
    onEvent: (event) => {
      if (event.kind === "ready") setApprovalEventsConnected(true);
      if (event.kind === "approval") {
        setApprovalEventsConnected(true);
        void handleApprovalSignal(event.id, true).catch(() => undefined);
      }
      if (event.kind === "notice") {
        setApprovalEventsConnected(true);
        void handleNotice(event.name, event.payload).catch(() => undefined);
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
  const onPush = (data: unknown) => {
    const id = approvalIdFromPushData(data);
    const kind = kindFromPushData(data);
    if (kind && kind !== "approval") {
      const item = noticeFromEvent(kind, data);
      void (async () => {
        if (item) await rememberNotice(item);
        emitInboxChanged();
      })().catch(() => undefined);
      return;
    }
    if (id) void handleApprovalSignal(id, false).catch(() => undefined);
  };
  const received = Notifications.addNotificationReceivedListener((notification) => {
    onPush(notification.request.content.data);
  });
  const response = Notifications.addNotificationResponseReceivedListener((event) => {
    onPush(event.notification.request.content.data);
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
    reconnect() {
      if (stopped) return;
      stream.reconnect();
    },
  };
}
