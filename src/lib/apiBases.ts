/**
 * Client API bases only — never dashboard :8080, never ephemeral trycloudflare.
 * Remaps mistaken :8080 → :8765 (LAN client API). Drops durable-invalid hosts.
 * Source of truth: HOST_E2E_HANDOFF.md
 */
export function normalizeClientApiBase(
  raw: string | undefined | null,
): string {
  const s = String(raw || "")
    .trim()
    .replace(/\/+$/, "");
  if (!s) return "";
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return "";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "";
  // Quick Tunnels are not a durable Away base.
  if (/\.trycloudflare\.com$/i.test(url.hostname)) return "";
  // Dashboard is browser-only; client API listens on :8765.
  if (url.port === "8080") {
    url.port = "8765";
  }
  return url.toString().replace(/\/+$/, "");
}
