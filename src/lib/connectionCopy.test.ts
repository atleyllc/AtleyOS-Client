import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UNPAIRED_MESSAGE, explainUnreachable } from "./connectionCopy";

const LAN = "http://192.168.8.140:8765";
const AWAY = "https://atleyos.atley.llc";

describe("connection copy", () => {
  it("tells an unpaired phone to pair", () => {
    assert.match(UNPAIRED_MESSAGE, /isn’t paired yet/);
    assert.match(UNPAIRED_MESSAGE, /home Wi‑Fi/);
    assert.doesNotMatch(UNPAIRED_MESSAGE, /127\.0\.0\.1/);
  });

  it("names the LAN and Away addresses that were tried", () => {
    const { message, suggestPair } = explainUnreachable({
      onWifi: true,
      allowLoopback: false,
      https: AWAY,
      lan: LAN,
      overlay: "",
      tried: [AWAY, LAN],
      httpsReady: true,
    });
    assert.match(message, new RegExp(`Away ${AWAY}`));
    assert.match(message, /tunnel is up/);
    assert.match(message, new RegExp(`LAN ${LAN}`));
    assert.match(message, /same Wi‑Fi/);
    assert.equal(suggestPair, false);
    assert.doesNotMatch(message, /Home API unreachable/);
  });

  it("says which loopback address was skipped and points at pairing", () => {
    const { message, suggestPair } = explainUnreachable({
      onWifi: true,
      allowLoopback: false,
      https: "",
      lan: "http://127.0.0.1:8765",
      overlay: "",
      tried: [],
    });
    assert.match(message, /127\.0\.0\.1:8765/);
    assert.match(message, /this phone/);
    assert.match(message, /re-pair/i);
    assert.equal(suggestPair, true);
  });

  it("names Away when the tunnel is not ready", () => {
    const { message, suggestPair } = explainUnreachable({
      onWifi: false,
      allowLoopback: false,
      https: AWAY,
      lan: LAN,
      overlay: "",
      tried: [],
      httpsReady: false,
    });
    assert.match(message, new RegExp(AWAY.replace(/[.]/g, "\\.")));
    assert.match(message, /tunnel is not up/);
    assert.equal(suggestPair, false);
  });

  it("asks for Away setup when the phone is off Wi-Fi and has no Away URL", () => {
    const { message, suggestPair } = explainUnreachable({
      onWifi: false,
      allowLoopback: false,
      https: "",
      lan: LAN,
      overlay: "",
      tried: [],
    });
    assert.match(message, /Away HTTPS isn’t saved/);
    assert.equal(suggestPair, true);
  });
});
