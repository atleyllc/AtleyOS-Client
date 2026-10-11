import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatTokens, formatUsd, parseUsage } from "./aiUsage";
import { codingTone, parseCoding } from "./coding";
import { machineReadings, machineTone, parseMachines } from "./machines";
import { relativeTime, syncCopy } from "./syncCopy";
import { statusChip } from "./tone";

describe("status chips", () => {
  it("shortens home app status to a word", () => {
    assert.deepEqual(statusChip("up"), { label: "Up", tone: "ok" });
    assert.deepEqual(statusChip("DOWN"), { label: "Down", tone: "danger" });
    assert.equal(statusChip(""), null);
    assert.equal(statusChip(null), null);
  });
});

describe("machines", () => {
  it("parses machines, pending approvals, and readings", () => {
    const snap = parseMachines({
      machines: [
        { name: "server", label: "AtleyOS-Server", online: true, state: "busy", is_server: true, current_job: { title: "Fix sync" } },
        { name: "air", os: "macos", online: true, state: "idle", info: { lid_closed: true, on_ac: true, battery_pct: 80 } },
        { name: "hades", online: false },
        { nope: 1 },
      ],
      pending: [{ id: "j9", title: "Upload to TestFlight", status: "pending_approval" }],
      jobs: [{ id: "j1", task: "ask", status: "done" }, null],
    });
    assert.equal(snap.total, 3);
    assert.equal(snap.online, 2);
    assert.equal(snap.machines[0].currentJob, "Fix sync");
    assert.equal(snap.machines[1].readings, "Lid closed · on power · 80%");
    assert.equal(snap.machines[2].stateLabel, "Offline");
    assert.equal(snap.pending[0].title, "Upload to TestFlight");
    assert.equal(snap.jobs[0].title, "ask");
    assert.equal(machineTone(snap.machines[0]), "accent");
    assert.equal(machineTone(snap.machines[2]), "muted");
  });
  it("survives junk", () => {
    assert.deepEqual(parseMachines(null).machines, []);
    assert.equal(machineReadings(null), "");
  });
});

describe("coding jobs", () => {
  it("splits open and recent without repeats", () => {
    const snap = parseCoding({
      open: [{ id: "a", repo: "strikenote", title: "Fix", status: "running", tier: "local" }],
      recent: [{ id: "a", status: "running" }, { id: "b", status: "pr_open", tier: "cursor", pr_url: "https://x/pull/2", pr_number: 2 }],
      savings: { local_share_pct: 83, headline: "5 local", plan: { label: "Cursor Pro", usage_line: "1 job" } },
    });
    assert.equal(snap.open.length, 1);
    assert.deepEqual(snap.recent.map((j) => j.id), ["b"]);
    assert.equal(snap.recent[0].tier, "cursor");
    assert.equal(snap.localSharePct, 83);
    assert.equal(snap.planLabel, "Cursor Pro");
    assert.equal(codingTone(snap.open[0]), "accent");
    assert.equal(codingTone({ status: "waiting_approval" }), "warn");
    assert.equal(codingTone({ status: "merged" }), "ok");
  });
});

describe("AI usage", () => {
  it("sums accounts and keeps unknowns unknown", () => {
    const snap = parseUsage({
      days: 30,
      totals: { api_spend_usd: 18.42, plans_monthly_usd: 60, local_output_tokens: 1840000 },
      sources: [
        { id: "cursor", title: "Cursor", status: "ok", accounts: [{ spend_usd: 12 }, { spend_usd: 0.5 }] },
        { id: "anthropic", title: "Claude", status: "not_connected", accounts: [] },
      ],
      plans: [{ label: "Cursor Pro", monthly_usd: 20 }],
      recommendations: [{ title: "Drop Claude Pro", body: "Unused" }, "Plain text tip"],
    });
    assert.equal(snap.sources[0].spendUsd, 12.5);
    assert.equal(snap.sources[1].spendUsd, null);
    assert.equal(snap.recommendations.length, 2);
    assert.equal(formatUsd(null), "—");
    assert.equal(formatUsd(18.42), "$18.42");
    assert.equal(formatTokens(1840000), "1.8M");
    assert.equal(formatTokens(98000), "98K");
  });
});

describe("You sync status", () => {
  const now = 1_000_000_000_000;
  it("explains a backlog instead of a bare number", () => {
    const copy = syncCopy({ pending: 1050, lastSyncAt: now - 4 * 60_000, sources: {} }, { now });
    assert.equal(copy.headline, "1,050 items waiting to upload");
    assert.match(copy.detail, /100 at a time \(11 passes left\)/);
    assert.match(copy.detail, /4 min ago/);
    assert.equal(copy.tone, "warn");
  });
  it("shows progress while syncing", () => {
    const copy = syncCopy({ pending: 525, sources: {} }, { now, syncing: true, startPending: 1050 });
    assert.equal(copy.progress, 0.5);
    assert.equal(copy.chip, "Syncing");
  });
  it("is calm when empty", () => {
    assert.equal(syncCopy({ pending: 0, lastSyncAt: now, sources: {} }, { now }).headline, "Up to date");
    assert.equal(syncCopy(null).chip, "Off");
    assert.equal(syncCopy({ pending: 3, lastError: "timeout", sources: {} }).tone, "danger");
  });
  it("formats relative time", () => {
    assert.equal(relativeTime(now - 10_000, now), "just now");
    assert.equal(relativeTime(now - 3 * 3600_000, now), "3 h ago");
    assert.equal(relativeTime(undefined, now), "");
  });
});

import { mergeQueue, type QueueItem } from "./obsQueue";

describe("observation queue", () => {
  it("does not grow when the same items are collected again", () => {
    const a: QueueItem = { source_class: "contacts", title: "Audrey", external_id: "1" };
    const b: QueueItem = { source_class: "calendar", title: "Dentist", occurred_at: 5 };
    const once = mergeQueue([], [a, b]);
    const twice = mergeQueue(once, [a, b]);
    assert.equal(twice.length, 2);
    assert.equal(mergeQueue(twice, [{ ...a, title: "Audrey B" }]).find((i) => i.external_id === "1")?.title, "Audrey B");
  });
  it("caps the queue", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ source_class: "x", title: String(i) }));
    const capped = mergeQueue([], many, 10);
    assert.equal(capped.length, 10);
    assert.equal(capped[0].title, "20");
  });
});
