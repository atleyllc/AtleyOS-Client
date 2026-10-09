/**
 * Owner switch "Approval push", default off.
 * Registering a token does not turn the switch on.
 *
 * The client contract names the switch and does not name its JSON field.
 * This reads the boolean names a status payload is likely to use. If none
 * of them is present, the phone stays off and does not register.
 */
const FLAG_KEYS = ["approval_push", "approval_push_enabled", "push_approvals", "approvals_push"] as const;

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readFlag(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  const rec = record(value);
  if (rec && typeof rec.enabled === "boolean") return rec.enabled;
  return undefined;
}

export function readApprovalPushEnabled(body: unknown): boolean {
  const root = record(body);
  if (!root) return false;
  const remote = record(root.remote_access);
  const places = [root, remote, record(root.device), record(remote?.settings)];
  for (const place of places) {
    if (!place) continue;
    for (const key of FLAG_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(place, key)) continue;
      const flag = readFlag(place[key]);
      if (typeof flag === "boolean") return flag;
    }
  }
  return false;
}

export function isExpoPushToken(token: string): boolean {
  return /^ExponentPushToken\[[^\]]+\]$/.test(token.trim());
}

export function pushRegisterBody(
  token: string,
  platform: string,
): { expo_push_token: string; platform: string } {
  return { expo_push_token: token, platform };
}
