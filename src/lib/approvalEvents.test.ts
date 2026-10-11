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
    assert.equal(parsed.lastEventId, "");
  });

  it("reads a storage alert and keeps the last event id", () => {
    const body = ["id: 9", "event: storage_alert", 'data: {"id":"k1","title":"Disk"}', "", ""].join("\n");
    const parsed = takeApprovalEvents(body);
    assert.equal(parsed.lastEventId, "9");
    assert.equal(parsed.events[0]?.kind, "notice");
    if (parsed.events[0]?.kind === "notice") {
      assert.equal(parsed.events[0].name, "storage_alert");
    }
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
