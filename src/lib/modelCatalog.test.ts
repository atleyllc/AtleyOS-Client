import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activeModelRequestBody,
  isModelsRouteMissing,
  parseModelCatalog,
} from "./modelCatalog";

describe("parseModelCatalog", () => {
  it("lists installed models, the active one, and labels remote models", () => {
    const catalog = parseModelCatalog({
      ok: true,
      active_model_id: "qwen2.5:7b",
      models: [
        {
          id: "qwen2.5:7b",
          name: "Qwen 2.5 7B",
          provider: "ollama",
          location: "local",
          installed: true,
        },
        {
          id: "claude",
          name: "Claude",
          provider: "anthropic",
          location: "remote",
          leaves_home_label: "Leaves home",
        },
        { id: "draft", name: "Draft", installed: false, location: "local" },
      ],
    });
    assert.equal(catalog.supported, true);
    assert.equal(catalog.activeId, "qwen2.5:7b");
    assert.deepEqual(
      catalog.models.map((model) => [model.id, model.active, model.leavesHome, model.leavingHomeLabel]),
      [
        ["qwen2.5:7b", true, false, null],
        ["claude", false, true, "Leaves home"],
      ],
    );
    assert.equal(catalog.models[0].location, "local");
    assert.equal(catalog.models[1].location, "remote");
  });

  it("defaults to local when the host does not say otherwise", () => {
    const catalog = parseModelCatalog({
      models: [{ id: "local-default", name: "Local default" }],
    });
    assert.equal(catalog.models[0].leavesHome, false);
    assert.equal(catalog.models[0].leavingHomeLabel, null);
    assert.equal(catalog.models[0].location, "local");
  });

  it("lets an explicit leaves_home flag win over location", () => {
    const keptLocal = parseModelCatalog({
      models: [{ id: "a", location: "remote", leaves_home: false }],
    });
    assert.equal(keptLocal.models[0].leavesHome, false);
    const forced = parseModelCatalog({
      models: [{ id: "b", location: "local", leaves_home: true }],
    });
    assert.equal(forced.models[0].leavesHome, true);
    assert.equal(forced.models[0].leavingHomeLabel, "Leaves home");
  });

  it("accepts an active object and alternate list keys", () => {
    const catalog = parseModelCatalog({
      active: { id: "m2" },
      installed_models: [
        { model_id: "m1", label: "One" },
        { model_id: "m2", label: "Two" },
      ],
    });
    assert.equal(catalog.activeId, "m2");
    assert.equal(catalog.models.find((model) => model.id === "m2")?.active, true);
  });

  it("treats a body without a model list as an older host", () => {
    assert.equal(parseModelCatalog({ ok: true }).supported, false);
    assert.equal(parseModelCatalog(null).supported, false);
  });
});

describe("active model request", () => {
  it("posts the id under both keys the host might read", () => {
    assert.deepEqual(activeModelRequestBody(" qwen2.5:7b "), {
      id: "qwen2.5:7b",
      model_id: "qwen2.5:7b",
    });
  });

  it("treats 404, 405, and 501 as a missing models route", () => {
    assert.equal(isModelsRouteMissing(404), true);
    assert.equal(isModelsRouteMissing(405), true);
    assert.equal(isModelsRouteMissing(501), true);
    assert.equal(isModelsRouteMissing(401), false);
  });
});
