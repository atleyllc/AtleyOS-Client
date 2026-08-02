/**
 * Pending Action assent + push hooks (post-MVP surface).
 * Push payloads must carry opaque ids only — never Knowledge contents.
 */

export type PendingApproval = {
  id: string;
  title: string;
  summary: string;
  createdAt: number;
};

let _pending: PendingApproval[] = [];

export function listApprovals(): PendingApproval[] {
  return [..._pending];
}

export function seedDemoApproval(): void {
  _pending = [
    {
      id: "demo-1",
      title: "Turn on office lights",
      summary: "Home Assistant action needs your assent",
      createdAt: Date.now(),
    },
  ];
}

export function resolveApproval(id: string, _decision: "allow" | "deny"): void {
  _pending = _pending.filter((p) => p.id !== id);
}

export type HaFavorite = {
  entityId: string;
  label: string;
};

export function defaultHaFavorites(): HaFavorite[] {
  return [
    { entityId: "light.office", label: "Office lights" },
    { entityId: "light.living_room", label: "Living room" },
  ];
}
