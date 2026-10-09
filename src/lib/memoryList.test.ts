import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryErrorCopy, parseMemory, validateMemoryText } from "./memoryList";

describe("memory", () => {
  it("reads context notes and an ISO updated_at", () => {
    const parsed = parseMemory({
      ok: true,
      items: [
        {
          id: "mem_1",
          text: "Prefers the window desk",
          kind: "context",
          updated_at: "2026-10-09T22:00:00+00:00",
        },
      ],
    });
    assert.equal(parsed.supported, true);
    assert.equal(parsed.items[0].text, "Prefers the window desk");
    assert.equal(parsed.items[0].kind, "context");
    assert.equal(parsed.items[0].updatedAt, Date.parse("2026-10-09T22:00:00+00:00"));
  });

  it("does not read a fact field as the note", () => {
    const parsed = parseMemory({
      ok: true,
      items: [{ id: "mem_2", fact: "This is not the text field", kind: "fact" }],
    });
    assert.deepEqual(parsed.items, []);
  });

  it("does not invent items when the list is missing", () => {
    assert.deepEqual(parseMemory({ ok: true }), { supported: false, items: [] });
  });

  it("names the memory error codes", () => {
    assert.equal(validateMemoryText("  "), "empty_text");
    assert.equal(validateMemoryText("x".repeat(4001)), "text_too_long");
    assert.equal(validateMemoryText("hello"), null);
    assert.match(memoryErrorCopy("invalid_kind"), /kind/);
    assert.match(memoryErrorCopy("not_found"), /doesn’t have/);
    assert.match(memoryErrorCopy("owner_required"), /Owner/);
    assert.equal(memoryErrorCopy("missing_id").length > 0, true);
  });
});
