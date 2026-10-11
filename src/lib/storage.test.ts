import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatBytes, parseStorage } from "./storage";

describe("storage", () => {
  it("reads drive roles, free space, health, and backup", () => {
    const parsed = parseStorage({
      ok: true,
      health: "ok",
      drives: [
        {
          id: "data",
          role: "data",
          label: "Data",
          bytes_total: 1_000_000_000_000,
          bytes_free: 400_000_000_000,
          health: "ok",
        },
      ],
      backup: { status: "stale", detail: "Last copy is old", last_success_at: "2026-10-09T00:00:00Z" },
    });
    assert.equal(parsed.supported, true);
    assert.equal(parsed.health, "ok");
    assert.equal(parsed.drives[0].role, "data");
    assert.equal(parsed.drives[0].freeBytes, 400_000_000_000);
    assert.equal(parsed.drives[0].health, "ok");
    assert.equal(parsed.backup?.status, "stale");
    assert.equal(parsed.backup?.lastSuccessAt, Date.parse("2026-10-09T00:00:00Z"));
    assert.match(formatBytes(400_000_000_000), /GB/);
  });

  it("treats a body without drives or backup as an older server", () => {
    assert.equal(parseStorage({ ok: true }).supported, false);
  });
});
