import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { awayCheckMessage, awayHealthUrl, phoneSetupSteps } from "./setupGuide";

describe("phone setup", () => {
  it("checks health on the Away base", () => {
    assert.equal(awayHealthUrl("https://atleyos.atley.llc"), "https://atleyos.atley.llc/api/client/health");
    assert.equal(awayHealthUrl(""), "");
  });

  it("names the Away address when the check fails", () => {
    const message = awayCheckMessage({ url: "https://atleyos.atley.llc", ok: false });
    assert.match(message, /https:\/\/atleyos\.atley\.llc/);
    assert.match(message, /tunnel is up/);
  });

  it("walks pair, Away, Photos, and Files", () => {
    const steps = phoneSetupSteps({
      paired: true,
      away: "unknown",
      awayAddress: "https://atleyos.atley.llc",
      photosUrl: "http://192.168.8.140:2283",
      filesUrl: "http://192.168.8.140:10081",
      learningDone: false,
    });
    assert.deepEqual(
      steps.map((step) => step.id),
      ["pair", "away", "photos", "files", "passwords", "learn"],
    );
    assert.match(steps[4].body, /Bitwarden/);
    assert.match(steps[4].body, /Self-hosted/);
    assert.equal(steps[0].done, true);
    assert.match(steps[2].body, /192\.168\.8\.140:2283/);
    assert.match(steps[2].body, /Immich/);
    assert.match(steps[3].body, /Nextcloud/);
    assert.equal(steps[2].primary, "Copy Photos URL");
  });
});
