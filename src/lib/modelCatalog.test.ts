import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activeModelRequestBody,
  formatModelSize,
  isModelsRouteMissing,
  OLLAMA_DOWN_MESSAGE,
  parseModelCatalog,
} from "./modelCatalog";

const HOST_CATALOG = {
  ok: true,
  chat_model: "phi4:latest",
  active: { conversation: "phi4:latest", coding: null },
  models: [
    {
      name: "phi4:latest",
      size_bytes: 9000000000,
      status: "installed",
      location: "local",
    },
    {
      name: "llama3.1:8b",
      size_bytes: 4900000000,
      status: "installed",
      location: "local",
    },
    {
      name: "draft",
      size_bytes: 10,
      status: "pulling",
      location: "local",
    },
  ],
  ollama: { reachable: true, endpoint: "http://127.0.0.1:11434" },
  remote: { enabled: false, leaves_machine: false },
};

describe("parseModelCatalog", () => {
  it("reads the host catalog: name, size, status, active roles, ollama", () => {
    const catalog = parseModelCatalog(HOST_CATALOG);
    assert.equal(catalog.supported, true);
    assert.equal(catalog.activeId, "phi4:latest");
    assert.deepEqual(catalog.activeRoles, {
      conversation: "phi4:latest",
      coding: null,
    });
    assert.equal(catalog.ollamaReachable, true);
    assert.equal(catalog.ollamaMessage, null);
    assert.equal(catalog.remoteEnabled, false);
    assert.equal(catalog.remoteLeavesMachine, false);
    assert.deepEqual(
      catalog.models.map((model) => [model.name, model.sizeBytes, model.location, model.active, model.leavesHome]),
      [
        ["phi4:latest", 9000000000, "local", true, false],
        ["llama3.1:8b", 4900000000, "local", false, false],
      ],
    );
    assert.equal(formatModelSize(catalog.models[0].sizeBytes), "9.0 GB");
  });

  it("says Ollama is not running when the host reports it down", () => {
    const catalog = parseModelCatalog({
      ...HOST_CATALOG,
      ollama: { reachable: false, endpoint: "http://127.0.0.1:11434" },
    });
    assert.equal(catalog.ollamaReachable, false);
    assert.equal(catalog.ollamaMessage, OLLAMA_DOWN_MESSAGE);
    assert.equal(catalog.ollamaMessage, "Ollama not running at home");
  });

  it("prefers active.conversation over chat_model when they differ", () => {
    const catalog = parseModelCatalog({
      chat_model: "phi4:latest",
      active: { conversation: "llama3.1:8b", coding: null },
      models: [
        { name: "phi4:latest", status: "installed", location: "local" },
        { name: "llama3.1:8b", status: "installed", location: "local" },
      ],
    });
    assert.equal(catalog.activeId, "llama3.1:8b");
  });

  it("treats active.chat as the conversation role", () => {
    const catalog = parseModelCatalog({
      active: { chat: "phi4:latest" },
      models: [{ name: "phi4:latest", status: "installed", location: "local" }],
    });
    assert.equal(catalog.activeRoles?.conversation, "phi4:latest");
    assert.equal(catalog.activeId, "phi4:latest");
  });
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
  it("posts the conversation role and model name", () => {
    assert.deepEqual(activeModelRequestBody(" llama3.1:8b "), {
      role: "conversation",
      model: "llama3.1:8b",
    });
  });

  it("maps chat to the conversation role and keeps other roles", () => {
    assert.deepEqual(activeModelRequestBody("phi4:latest", "chat"), {
      role: "conversation",
      model: "phi4:latest",
    });
    assert.deepEqual(activeModelRequestBody("phi4:latest", "coding"), {
      role: "coding",
      model: "phi4:latest",
    });
    assert.deepEqual(activeModelRequestBody("phi4:latest", "summarization"), {
      role: "summarization",
      model: "phi4:latest",
    });
    assert.deepEqual(activeModelRequestBody("phi4:latest", "lightweight_offline"), {
      role: "lightweight_offline",
      model: "phi4:latest",
    });
  });

  it("treats 404, 405, and 501 as a missing models route", () => {
    assert.equal(isModelsRouteMissing(404), true);
    assert.equal(isModelsRouteMissing(405), true);
    assert.equal(isModelsRouteMissing(501), true);
    assert.equal(isModelsRouteMissing(401), false);
  });
});
