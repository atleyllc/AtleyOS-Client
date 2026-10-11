import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  actionsForKind,
  isQuietAt,
  noticeFromEvent,
  parseInbox,
  parseQuietHours,
} from "./inbox";

describe("inbox", () => {
  it("gives storage alerts dismiss only", () => {
    assert.deepEqual(actionsForKind("storage_alert"), ["dismiss"]);
    const parsed = parseInbox({
      notifications: [
        { id: "s1", kind: "storage_alert", title: "Disk space", actions: ["approve", "erase"] },
        { id: "a1", kind: "approval", title: "Send a message", body: "Home asked" },
        { id: "r1", kind: "routine_result", title: "Morning", body: "Done" },
      ],
    });
    assert.equal(parsed.supported, true);
    assert.deepEqual(parsed.items[0].actions, ["dismiss"]);
    assert.deepEqual(parsed.items[1].actions, ["approve", "deny"]);
    assert.equal(parsed.items[2].kind, "routine");
  });

  it("reads a storage_alert knock from the event stream", () => {
    const item = noticeFromEvent("storage_alert", { id: "k1", title: "Backup disk is full" });
    assert.equal(item?.kind, "storage_alert");
    assert.deepEqual(item?.actions, ["dismiss"]);
  });

  it("treats a missing list as an older server", () => {
    assert.equal(parseInbox({ ok: true }).supported, false);
  });

  it("keeps quiet hours across midnight", () => {
    const quiet = parseQuietHours({ enabled: true, start: "22:00", end: "07:00" });
    assert.ok(quiet);
    assert.equal(isQuietAt(quiet!, new Date(2026, 9, 10, 23, 15)), true);
    assert.equal(isQuietAt(quiet!, new Date(2026, 9, 10, 6, 0)), true);
    assert.equal(isQuietAt(quiet!, new Date(2026, 9, 10, 12, 0)), false);
    assert.equal(isQuietAt({ ...quiet!, enabled: false }, new Date(2026, 9, 10, 23, 15)), false);
  });
});
