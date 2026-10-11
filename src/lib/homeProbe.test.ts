import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { sha256Hex } from "./sha256";
import { expectedProof, makeNonce, proofMatches } from "./homeProbe";

const node = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

test("sha256 matches known vectors and node for odd lengths", () => {
  assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  for (const s of ["a".repeat(55), "a".repeat(56), "a".repeat(64), "x".repeat(1000), "Wi‑Fi 🏠 home"]) {
    assert.equal(sha256Hex(s), node(s));
  }
});

test("proof matches the server formula", () => {
  const nonce = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
  // Same as server: sha256("atleyos-home-probe-v1:" + sha256(token) + ":" + nonce)
  assert.equal(expectedProof("tok-new", nonce), node(`atleyos-home-probe-v1:${node("tok-new")}:${nonce}`));
  assert.ok(proofMatches({ proofs: ["nope", expectedProof("tok-new", nonce)] }, "tok-new", nonce));
  assert.ok(!proofMatches({ proofs: [expectedProof("other", nonce)] }, "tok-new", nonce));
  assert.ok(!proofMatches({ ok: true }, "tok-new", nonce));
});

test("nonce is alphanumeric and in the server's length range", () => {
  const n = makeNonce();
  assert.match(n, /^[0-9a-f]{16,128}$/);
  assert.notEqual(n, makeNonce());
});
