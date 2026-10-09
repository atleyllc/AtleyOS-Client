import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseConversationList } from "./conversationParse";

describe("conversations", () => {
  it("reads a list with messages", () => {
    const parsed = parseConversationList({
      ok: true,
      conversations: [
        {
          id: "c1",
          title: "Morning",
          updated_at: 1_700_000_000,
          messages: [
            { role: "user", content: "Hello" },
            { role: "assistant", content: "Hi" },
          ],
        },
      ],
    });
    assert.equal(parsed.supported, true);
    assert.equal(parsed.conversations[0].title, "Morning");
    assert.equal(parsed.conversations[0].messages.length, 2);
    assert.ok((parsed.conversations[0].updatedAt || 0) > 1e12);
  });

  it("treats a body without a list as an older server", () => {
    assert.equal(parseConversationList({ ok: true }).supported, false);
  });
});
