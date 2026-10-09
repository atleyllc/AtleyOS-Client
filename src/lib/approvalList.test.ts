import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { approvalDecisionBody, parseApprovals, unseenApprovalIds } from "./approvalList";

describe("approvals", () => {
  it("reads a pending list and builds the decide body", () => {
    const parsed = parseApprovals({
      ok: true,
      approvals: [{ id: "a1", title: "Unlock the door", summary: "Home asked", created_at: 20 }],
    });
    assert.equal(parsed.supported, true);
    assert.equal(parsed.items[0].title, "Unlock the door");
    assert.deepEqual(approvalDecisionBody("a1", "deny"), { id: "a1", decision: "deny" });
  });

  it("treats a missing list as an older server", () => {
    assert.equal(parseApprovals({ ok: true }).supported, false);
  });

  it("notifies only for ids that were not already seen", () => {
    assert.deepEqual(unseenApprovalIds(["a1"], [{ id: "a1" }, { id: "a2" }]), ["a2"]);
    assert.deepEqual(unseenApprovalIds([], [{ id: "a1" }]), ["a1"]);
  });
});
