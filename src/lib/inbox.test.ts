import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  actionsForKind,
  noticeLines,
  whenLabel,
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

describe("clear alerts", () => {
  const backup = {
    id: "ntf_1",
    kind: "backup",
    title: "Backup failed",
    body: "The backup drive is not mounted. Plug it in, then tap Retry.",
    explanation: "The backup drive is not mounted. Plug it in, then tap Retry. Fix it opens a chat.",
    created_at: "2026-10-11T06:06:45+00:00",
    status: "unread",
    actions: [
      { id: "fix", label: "Fix it", enabled: true },
      { id: "retry", label: "Retry", enabled: true },
      { id: "dismiss", label: "Dismiss", enabled: true },
      { id: "open", label: "Open", enabled: true, href: "/storage" },
      { id: "approve", label: "Approve", enabled: false },
    ],
  };

  it("reads action objects, explanation, and time", () => {
    const [item] = parseInbox({ notifications: [backup] }).items;
    assert.deepEqual(item.actions, ["fix", "retry", "dismiss", "open"]);
    assert.equal(item.source, "backup");
    assert.match(item.explanation || "", /not mounted/);
    assert.equal(item.createdAt, Date.parse("2026-10-11T06:06:45+00:00"));
    assert.equal(item.openUrl, "", "a dashboard path is not a phone link");
  });

  it("hides resolved, dismissed, acted, and snoozed rows", () => {
    const later = new Date(Date.now() + 60_000).toISOString();
    const parsed = parseInbox({
      notifications: [
        { ...backup, id: "a", status: "resolved" },
        { ...backup, id: "b", status: "dismissed" },
        { ...backup, id: "c", status: "acted" },
        { ...backup, id: "d", status: "snoozed", snoozed_until: later },
        { ...backup, id: "e", status: "read" },
      ],
    });
    assert.deepEqual(parsed.items.map((i) => i.id), ["e"]);
  });

  it("puts the real title and reason in the shade for home-written alerts", () => {
    const [item] = parseInbox({ notifications: [backup] }).items;
    assert.deepEqual(noticeLines(item), {
      title: "Backup failed",
      body: "The backup drive is not mounted. Plug it in, then tap Retry.",
    });
  });

  it("keeps reminders generic in the shade", () => {
    const [item] = parseInbox({ notifications: [{ id: "r", kind: "reminder", title: "Call Mom about the surgery" }] }).items;
    assert.deepEqual(noticeLines(item), { title: "AtleyOS", body: "A reminder is ready." });
  });

  it("offers plan actions for Cursor plans", () => {
    const [item] = parseInbox({
      notifications: [
        {
          id: "p",
          kind: "coding",
          title: "Cursor's plan is ready",
          actions: [{ id: "approve_plan" }, { id: "followup" }, { id: "dismiss" }],
        },
      ],
    }).items;
    assert.deepEqual(item.actions, ["approve_plan", "followup", "dismiss"]);
    assert.equal(noticeLines(item).title, "Cursor's plan is ready");
  });

  it("never lets a storage alert do more than Fix it and Dismiss", () => {
    const [item] = parseInbox({
      notifications: [{ id: "s", kind: "storage_alert", title: "Disk", actions: [{ id: "approve" }, { id: "fix" }, { id: "retry" }] }],
    }).items;
    assert.deepEqual(item.actions, ["fix", "dismiss"]);
  });

  it("labels times plainly", () => {
    const now = new Date(2026, 9, 11, 12, 0);
    assert.match(whenLabel(new Date(2026, 9, 11, 2, 6).getTime(), now), /^Today /);
    assert.match(whenLabel(new Date(2026, 9, 10, 21, 0).getTime(), now), /^Yesterday /);
    assert.equal(whenLabel(null, now), "");
  });
});
