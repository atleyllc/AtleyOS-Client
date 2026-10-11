import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cloudEmbeddingWarning, parseSearch } from "./searchParse";

describe("search", () => {
  it("reads path, page, snippet, and open_url", () => {
    const parsed = parseSearch({
      ok: true,
      embedding_route: "local",
      results: [
        {
          title: "Notes",
          path: "/files/notes.md",
          page: 3,
          snippet: "The gate code",
          open_url: "https://files.example/notes.md",
        },
      ],
    });
    assert.equal(parsed.supported, true);
    assert.equal(parsed.cloud, false);
    assert.equal(parsed.hits[0].path, "/files/notes.md");
    assert.equal(parsed.hits[0].page, "3");
    assert.equal(parsed.hits[0].snippet, "The gate code");
    assert.equal(parsed.hits[0].openUrl, "https://files.example/notes.md");
    assert.equal(cloudEmbeddingWarning("local"), "");
  });

  it("warns when the embedding route is cloud", () => {
    const parsed = parseSearch({ embedding_route: "cloud", results: [] });
    assert.equal(parsed.cloud, true);
    assert.match(cloudEmbeddingWarning(parsed.embeddingRoute), /leave your home server/);
  });

  it("treats a body without results as an older server", () => {
    assert.equal(parseSearch({ ok: true }).supported, false);
  });
});
