/** Small, defensive readers for server JSON. */
export function rec(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
export function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}
export function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
export function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
export function bool(value: unknown): boolean {
  return value === true;
}
