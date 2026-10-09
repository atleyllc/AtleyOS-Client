import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readHttpsReady, sessionPatchFromStatus } from "./statusSync";

const session = {
  httpsApiBase: "https://atleyos.atley.llc",
  lanApiBase: "http://192.168.8.140:8765",
  httpsReady: true,
  profileContinuity: false,
};

describe("sessionPatchFromStatus", () => {
  it("keeps Away when status omits the URL", () => {
    const patch = sessionPatchFromStatus(session, { ok: true }, { allowLoopback: false });
    assert.equal(patch.httpsApiBase, undefined);
    assert.equal(patch.lanApiBase, undefined);
  });

  it("clears Away when the host sends an empty URL", () => {
    const patch = sessionPatchFromStatus(
      session,
      { https_api_base: "" },
      { allowLoopback: false },
    );
    assert.equal(patch.httpsApiBase, "");
  });

  it("records https_ready false without erasing the Away URL", () => {
    const patch = sessionPatchFromStatus(
      session,
      { https_ready: false, https_api_base: "https://atleyos.atley.llc" },
      { allowLoopback: false },
    );
    assert.equal(patch.httpsReady, false);
    assert.equal(patch.httpsApiBase, undefined);
  });

  it("does not treat WireGuard away_ready as Away HTTPS", () => {
    const body = { remote_access: { away_path: { away_ready: true } } };
    assert.equal(readHttpsReady(body), undefined);
    const patch = sessionPatchFromStatus(session, body, { allowLoopback: false });
    assert.equal(patch.httpsReady, undefined);
  });

  it("reads away_path.https_ready for the tunnel", () => {
    assert.equal(
      readHttpsReady({ remote_access: { away_path: { https_ready: false } } }),
      false,
    );
  });

  it("refuses to store a loopback LAN address on a real device", () => {
    const patch = sessionPatchFromStatus(
      session,
      { lan_api_base: "http://127.0.0.1:8765" },
      { allowLoopback: false },
    );
    assert.equal(patch.lanApiBase, undefined);
  });

  it("replaces a stale LAN address with the one home advertises", () => {
    const patch = sessionPatchFromStatus(
      { ...session, lanApiBase: "http://192.168.1.20:8765" },
      { lan_api_base: "http://192.168.8.140:8765" },
      { allowLoopback: false },
    );
    assert.equal(patch.lanApiBase, "http://192.168.8.140:8765");
  });

  it("drops a durable-invalid Away host when status omits https", () => {
    const patch = sessionPatchFromStatus(
      { ...session, httpsApiBase: "https://old.trycloudflare.com" },
      { ok: true },
      { allowLoopback: false },
    );
    assert.equal(patch.httpsApiBase, "");
  });
});
