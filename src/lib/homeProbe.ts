import { sha256Hex } from "./sha256";

export const HOME_PROBE_TAG = "atleyos-home-probe-v1";

/** What our own home server answers for this nonce. Mirrors the server's home_probe_proof. */
export function expectedProof(apiToken: string, nonce: string): string {
  return sha256Hex(`${HOME_PROBE_TAG}:${sha256Hex(apiToken)}:${nonce}`);
}

export function makeNonce(): string {
  const bytes = new Uint8Array(16);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  const t = Date.now().toString(16);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("") + t;
}

export function proofMatches(body: unknown, apiToken: string, nonce: string): boolean {
  if (!body || typeof body !== "object") return false;
  const proofs = (body as { proofs?: unknown }).proofs;
  if (!Array.isArray(proofs)) return false;
  const want = expectedProof(apiToken, nonce);
  return proofs.some((p) => typeof p === "string" && p === want);
}
