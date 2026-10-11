import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TAB_ICON_ROUTES, tabIconName } from "./tabIcons";

describe("tab icons", () => {
  it("maps every bottom tab to a drawn glyph", () => {
    assert.deepEqual(
      ["chat", "home", "you", "approvals", "settings"].map((name) => tabIconName(name)),
      [...TAB_ICON_ROUTES],
    );
  });

  it("ignores routes that are not tabs", () => {
    assert.equal(tabIconName("pair"), null);
    assert.equal(tabIconName(""), null);
  });
});
