/**
 * Phone push stays inside this app.
 * Expo's push service is the free channel this client already speaks.
 * ntfy and any other app are not used, even if a server field names them.
 */
import { readApprovalPushEnabled } from "./pushGate";

export type PushPlan = {
  enabled: boolean;
  provider: "expo" | "skip";
  /** Why registration is skipped. Empty when Expo push should register. */
  skipReason: string;
};

const OTHER_APP = /ntfy|unifiedpush|gotify|pushover/i;

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function enabledFlag(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  const rec = record(value);
  if (rec && typeof rec.enabled === "boolean") return rec.enabled;
  return undefined;
}

const EXTRA_FLAGS = ["notification_push", "notifications_push", "push_enabled", "phone_push"] as const;

export function readPushPlan(body: unknown): PushPlan {
  const root = record(body);
  if (!root) return { enabled: false, provider: "skip", skipReason: "" };
  const push = record(root.push) || record(record(root.remote_access)?.push);
  const provider = text(push?.provider) || text(root.push_provider);
  if (provider && OTHER_APP.test(provider)) {
    return {
      enabled: false,
      provider: "skip",
      skipReason: "Notices stay in AtleyOS. This phone does not open another app for them.",
    };
  }
  if (provider && !/^(expo|exponent)$/i.test(provider)) {
    return {
      enabled: false,
      provider: "skip",
      skipReason: `Home asked for “${provider}” push. This app only receives notices itself.`,
    };
  }
  let enabled = readApprovalPushEnabled(body);
  const places = [root, record(root.remote_access), record(root.device), push];
  for (const place of places) {
    if (!place) continue;
    for (const key of EXTRA_FLAGS) {
      if (!Object.prototype.hasOwnProperty.call(place, key)) continue;
      const flag = enabledFlag(place[key]);
      if (flag === true) enabled = true;
    }
  }
  if (push && typeof push.enabled === "boolean") enabled = push.enabled;
  if (!enabled) return { enabled: false, provider: "skip", skipReason: "" };
  return { enabled: true, provider: "expo", skipReason: "" };
}
