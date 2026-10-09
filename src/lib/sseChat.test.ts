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
    assert.deepEqual(reduceChatStream(body, true), {
      content: "Hello home",
      streamed: true,
      conversationId: null,
    });
  });

  it("keeps conversation_id and ignores an empty stop delta", () => {
    const body = [
      'data: {"object":"chat.completion.chunk","model":"atleyos","conversation_id":"conv_1","choices":[{"index":0,"delta":{"content":"Hi"},"finish_reason":null}]}',
      "",
      'data: {"object":"chat.completion.chunk","model":"atleyos","conversation_id":"conv_1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
      "",
      "data: [DONE]",
      "",
    ].join("\n");
    assert.deepEqual(reduceChatStream(body, true), {
      content: "Hi",
      streamed: true,
      conversationId: "conv_1",
    });
  });

  it("reads a non-stream JSON body when the server ignores stream", () => {
    const body = JSON.stringify({ choices: [{ message: { content: "Still here" } }] });
    assert.deepEqual(reduceChatStream(body, true), {
      content: "Still here",
      streamed: false,
      conversationId: null,
    });
  });

  it("does not treat a partial JSON frame as finished text", () => {
    const partial = 'data: {"choices":[{"delta":{"content":"Hi"}}]}';
    assert.deepEqual(reduceChatStream(partial, false), {
      content: "",
      streamed: false,
      conversationId: null,
    });
    assert.deepEqual(reduceChatStream(`${partial}\n\n`, false), {
      content: "Hi",
      streamed: true,
      conversationId: null,
    });
  });
});
