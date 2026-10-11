import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deleteConfirmCopy, extrasFromChatJson, finishToolCalls, mergeToolDelta } from "./chatTools";

describe("chat tools", () => {
  it("shows a plain summary, an undo note, and a second confirm for deletes", () => {
    const extras = extrasFromChatJson({
      choices: [
        {
          message: {
            content: "I can delete that.",
            tool_calls: [
              {
                id: "call_1",
                approval_id: "ap_1",
                undo: "Undo is on the dashboard for a day.",
                function: {
                  name: "delete_file",
                  arguments: JSON.stringify({ path: "/files/notes.md", summary: "Delete notes.md" }),
                },
              },
            ],
          },
        },
      ],
      citations: [
        { path: "/files/notes.md", page: 1, snippet: "old note", open_url: "https://files.example/notes.md" },
      ],
      embedding_route: "cloud",
    });
    assert.equal(extras.toolCalls[0].summary, "Delete notes.md");
    assert.equal(extras.toolCalls[0].isDelete, true);
    assert.equal(extras.toolCalls[0].approvalId, "ap_1");
    assert.match(extras.toolCalls[0].undoNote, /dashboard/);
    assert.equal(extras.citations[0].openUrl, "https://files.example/notes.md");
    assert.equal(extras.embeddingRoute, "cloud");
    const confirm = deleteConfirmCopy(extras.toolCalls[0]);
    assert.match(confirm.message, /Confirm again/);
    assert.match(confirm.message, /Undo is on the dashboard/);
  });

  it("assembles a streamed tool call without dumping raw arguments", () => {
    let partial = mergeToolDelta([], [
      { index: 0, id: "call_2", function: { name: "search_files", arguments: "{\"q\":" } },
    ]);
    partial = mergeToolDelta(partial, [{ index: 0, function: { arguments: "\"gate\"}" } }]);
    const [tool] = finishToolCalls(partial);
    assert.equal(tool.name, "search_files");
    assert.equal(tool.summary, "Search files");
    assert.equal(tool.isDelete, false);
    assert.doesNotMatch(tool.summary, /\{/);
  });
});
