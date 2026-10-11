import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readPushPlan } from "./pushMechanism";

describe("push mechanism", () => {
  it("uses Expo push when home turns phone notices on", () => {
    assert.deepEqual(readPushPlan({ push: { provider: "expo", enabled: true } }), {
      enabled: true,
      provider: "expo",
      skipReason: "",
    });
    assert.equal(readPushPlan({ notification_push: true }).provider, "expo");
  });

  it("does not hand notices to ntfy or another app", () => {
    const plan = readPushPlan({ push: { provider: "ntfy", enabled: true } });
    assert.equal(plan.provider, "skip");
    assert.match(plan.skipReason, /another app/);
  });

  it("stays off when home has not enabled push", () => {
    assert.equal(readPushPlan({ ok: true }).enabled, false);
  });
});
