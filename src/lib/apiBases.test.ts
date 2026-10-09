import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isLoopbackClientBase,
  normalizeClientApiBase,
  orderedApiBases,
  unpairedFallbackBases,
} from "./apiBases";

const session = {
  httpsApiBase: "https://atleyos.atley.llc",
  lanApiBase: "http://192.168.8.140:8765",
  overlayApiBase: "http://10.55.0.1:8765",
};

describe("loopback", () => {
  it("recognizes phone-local addresses", () => {
    assert.equal(isLoopbackClientBase("http://127.0.0.1:8765"), true);
    assert.equal(isLoopbackClientBase("http://localhost:8765"), true);
    assert.equal(isLoopbackClientBase("http://[::1]:8765"), true);
    assert.equal(isLoopbackClientBase("http://192.168.8.140:8765"), false);
    assert.equal(isLoopbackClientBase("https://atleyos.atley.llc"), false);
  });

  it("does not fall back to 127.0.0.1 on a real device", () => {
    assert.deepEqual(unpairedFallbackBases(false), []);
    assert.deepEqual(unpairedFallbackBases(true), ["http://127.0.0.1:8765"]);
  });
});

describe("orderedApiBases", () => {
  it("prefers Away then LAN on Wi-Fi", () => {
    assert.deepEqual(orderedApiBases(session, { onWifi: true, allowLoopback: false }), [
      "https://atleyos.atley.llc",
      "http://192.168.8.140:8765",
      "http://10.55.0.1:8765",
    ]);
  });

  it("uses only Away off Wi-Fi", () => {
    assert.deepEqual(orderedApiBases(session, { onWifi: false, allowLoopback: false }), [
      "https://atleyos.atley.llc",
    ]);
  });

  it("drops Away when the host says the tunnel is not ready", () => {
    assert.deepEqual(
      orderedApiBases(session, { onWifi: false, allowLoopback: false, httpsReady: false }),
      [],
    );
    assert.deepEqual(
      orderedApiBases(session, { onWifi: true, allowLoopback: false, httpsReady: false }),
      ["http://192.168.8.140:8765", "http://10.55.0.1:8765"],
    );
  });

  it("drops loopback LAN on a real device and keeps a real Away URL", () => {
    assert.deepEqual(
      orderedApiBases(
        {
          httpsApiBase: "https://atleyos.atley.llc",
          lanApiBase: "http://127.0.0.1:8765",
          overlayApiBase: "",
        },
        { onWifi: true, allowLoopback: false },
      ),
      ["https://atleyos.atley.llc"],
    );
  });

  it("still remaps dashboard :8080 to the client API", () => {
    assert.equal(
      normalizeClientApiBase("http://192.168.8.140:8080"),
      "http://192.168.8.140:8765",
    );
  });
});
