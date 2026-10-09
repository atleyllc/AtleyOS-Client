import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { favoriteToggleBody, parseFavorites } from "./favoriteList";

describe("favorites", () => {
  it("reads favorites and sends id plus entity_id", () => {
    const parsed = parseFavorites({
      ok: true,
      favorites: [{ id: "f1", entity_id: "light.office", label: "Office", state: "off" }],
    });
    assert.equal(parsed.favorites[0].label, "Office");
    assert.deepEqual(favoriteToggleBody(parsed.favorites[0]), {
      id: "f1",
      entity_id: "light.office",
    });
  });

  it("treats a missing list as an older server", () => {
    assert.equal(parseFavorites({ ok: false }).supported, false);
  });
});
