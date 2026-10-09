import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isExpoPushToken, pushRegisterBody, readApprovalPushEnabled } from "./pushGate";

describe("approval push gate", () => {
  it("stays off unless the Owner switch is explicitly on", () => {
    assert.equal(readApprovalPushEnabled({ ok: true }), false);
    assert.equal(readApprovalPushEnabled({ approval_push: false }), false);
    assert.equal(readApprovalPushEnabled({ remote_access: { approval_push_enabled: true } }), true);
    assert.equal(readApprovalPushEnabled({ device: { approvals_push: { enabled: true } } }), true);
    assert.equal(readApprovalPushEnabled({ push_approvals: { enabled: false } }), false);
  });

  it("registers an Expo token and can send an empty token to clear it", () => {
    assert.equal(isExpoPushToken("ExponentPushToken[abc]"), true);
    assert.equal(isExpoPushToken("not-a-token"), false);
    assert.deepEqual(pushRegisterBody("ExponentPushToken[abc]", "android"), {
      expo_push_token: "ExponentPushToken[abc]",
      platform: "android",
    });
    assert.deepEqual(pushRegisterBody("", "android"), { expo_push_token: "", platform: "android" });
  });
});
