import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { approvalIdFromPushData, takeApprovalEvents } from "./approvalEvents";

describe("approval events", () => {
  it("reads ready, an opaque approval id, and the ping comment", () => {
    const body = [
      "event: ready",
      'data: {"ok":true}',
      "",
      "event: approval",
      'data: {"id":"ap_1"}',
      "",
      ": ping",
      "",
      "",
    ].join("\n");
    const parsed = takeApprovalEvents(body);
    assert.deepEqual(parsed.events, [
      { kind: "ready" },
      { kind: "approval", id: "ap_1" },
      { kind: "ping" },
    ]);
    assert.equal(parsed.rest, "");
  });

  it("holds a partial frame", () => {
    const parsed = takeApprovalEvents('event: approval\ndata: {"id":"ap_2"}');
    assert.deepEqual(parsed.events, []);
    assert.match(parsed.rest, /ap_2/);
  });

  it("reads only the id from a push payload", () => {
    assert.equal(approvalIdFromPushData({ id: "ap_3", title: "secret" }), "ap_3");
    assert.equal(approvalIdFromPushData({ title: "secret" }), "");
    assert.equal(approvalIdFromPushData(null), "");
  });
});
