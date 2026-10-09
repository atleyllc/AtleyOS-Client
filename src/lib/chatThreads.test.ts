import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { threadTitle, upsertThread, type LocalThread } from "./chatThreads";

describe("local chat threads", () => {
  it("titles a thread from the first thing you said", () => {
    assert.equal(threadTitle([{ role: "user", content: "  Where are the keys?  " }]), "Where are the keys?");
    assert.equal(threadTitle([]), "Chat");
  });

  it("keeps the newest copy of a thread first", () => {
    const older: LocalThread = { id: "a", title: "A", updatedAt: 1, messages: [] };
    const newer: LocalThread = { id: "a", title: "A2", updatedAt: 2, messages: [] };
    const other: LocalThread = { id: "b", title: "B", updatedAt: 1, messages: [] };
    assert.deepEqual(
      upsertThread([older, other], newer).map((thread) => thread.id),
      ["a", "b"],
    );
    assert.equal(upsertThread([older, other], newer)[0].title, "A2");
  });
});
