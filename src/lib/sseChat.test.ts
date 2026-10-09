import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reduceChatStream } from "./sseChat";

describe("chat stream", () => {
  it("appends SSE deltas and stops at DONE", () => {
    const body = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}',
      "",
      'data: {"choices":[{"delta":{"content":" home"}}]}',
      "",
      "data: [DONE]",
      "",
    ].join("\n");
    assert.deepEqual(reduceChatStream(body, true), { content: "Hello home", streamed: true });
  });

  it("reads a non-stream JSON body when the server ignores stream", () => {
    const body = JSON.stringify({ choices: [{ message: { content: "Still here" } }] });
    assert.deepEqual(reduceChatStream(body, true), { content: "Still here", streamed: false });
  });

  it("does not treat a partial JSON frame as finished text", () => {
    const partial = 'data: {"choices":[{"delta":{"content":"Hi"}}]}';
    assert.deepEqual(reduceChatStream(partial, false), { content: "", streamed: false });
    assert.deepEqual(reduceChatStream(`${partial}\n\n`, false), { content: "Hi", streamed: true });
  });
});
