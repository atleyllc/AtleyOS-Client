import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseMemory } from "./memoryList";

describe("memory", () => {
  it("reads items when the server has a memory route", () => {
    const parsed = parseMemory({
      ok: true,
      items: [{ id: "m1", text: "Prefers the window desk", kind: "fact" }],
    });
    assert.equal(parsed.supported, true);
    assert.equal(parsed.items[0].text, "Prefers the window desk");
  });

  it("does not invent items when the list is missing", () => {
    assert.deepEqual(parseMemory({ ok: true }), { supported: false, items: [] });
  });
});
