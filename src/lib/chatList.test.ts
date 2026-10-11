import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { friendlyChatError, groupChats, parseChatRows } from "./chatList";
import { parseMarkdown, parseInline } from "./markdown";
class ApiError extends Error {
  constructor(message: string, public status: number, public body: unknown) {
    super(message);
  }
}

describe("chat list", () => {
  it("reads home's list and groups pinned first", () => {
    const now = new Date(2026, 9, 11, 12, 0);
    const rows = parseChatRows({
      conversations: [
        { id: "a", title: "Backup", updated_at: new Date(2026, 9, 11, 9).toISOString(), pinned: true, preview: "ok" },
        { id: "b", title: "", updated_at: new Date(2026, 9, 11, 8).toISOString() },
        { id: "c", title: "FPV", updated_at: new Date(2026, 9, 10, 8).toISOString() },
        { id: "d", title: "Old", updated_at: new Date(2026, 8, 1).toISOString(), match: "…the drone…" },
        { title: "no id" },
      ],
    })!;
    assert.equal(rows.length, 4);
    assert.equal(rows[1].title, "New chat");
    assert.deepEqual(
      groupChats(rows, now).map((g) => [g.label, g.rows.map((r) => r.id)]),
      [["Pinned", ["a"]], ["Today", ["b"]], ["Yesterday", ["c"]], ["Older", ["d"]]],
    );
    assert.equal(parseChatRows({ ok: true }), null);
  });
});

describe("chat errors", () => {
  it("only says re-pair on a real 401", () => {
    assert.equal(friendlyChatError(new ApiError("x", 401, null)).repair, true);
    assert.equal(friendlyChatError(new ApiError("Auth failed", 503, null)).repair, false);
    assert.equal(friendlyChatError(new Error("Home at https://x didn’t answer in time")).repair, false);
    assert.match(friendlyChatError(new ApiError("big", 413, null)).text, /too big/);
  });
});

describe("markdown", () => {
  it("reads code fences, lists, headings, and inline marks", () => {
    const blocks = parseMarkdown("# Title\n\nSome **bold** and `code`.\n\n- one\n- two\n\n```bash\nls -la\n```\n> note");
    assert.deepEqual(blocks.map((b) => b.type), ["heading", "paragraph", "list", "code", "quote"]);
    const code = blocks[3];
    assert.ok(code.type === "code" && code.lang === "bash" && code.text === "ls -la");
    assert.deepEqual(parseInline("a **b** [c](https://x.y)"), [
      { text: "a " },
      { text: "b", bold: true },
      { text: " " },
      { text: "c", href: "https://x.y" },
    ]);
  });

  it("keeps an unclosed fence as code", () => {
    const blocks = parseMarkdown("```\nstill streaming");
    assert.equal(blocks[0].type, "code");
  });
});
