import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseConversation, parseConversationList } from "./conversationParse";

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

  it("reads a detail row and maps owner turns to user", () => {
    const detail = parseConversation({
      ok: true,
      id: "c2",
      title: "Hello",
      updated_at: "2026-10-09T22:00:00+00:00",
      messages: [
        { role: "owner", content: "Hello" },
        { role: "user", content: "Again" },
        { role: "assistant", content: "Hi" },
      ],
    });
    assert.equal(detail?.messages[0].role, "user");
    assert.equal(detail?.messages[1].role, "user");
    assert.equal(detail?.messages[2].role, "assistant");
    assert.equal(detail?.updatedAt, Date.parse("2026-10-09T22:00:00+00:00"));
  });
});
