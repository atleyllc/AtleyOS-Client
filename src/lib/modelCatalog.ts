/**
 * Client view of the home model catalog.
 * Contract (host docs/models.md, client API on :8765):
 *   GET  /api/client/models
 *   POST /api/client/models/active   { "id", "model_id" }
 * Local is the default. Remote models must be labeled as leaving home.
 * A missing route (404/405/501) means an older host — Chat still works.
 */

export type ModelLocation = "local" | "remote";

export type InstalledModel = {
  id: string;
  name: string;
  provider: string | null;
  location: ModelLocation;
  leavesHome: boolean;
  /** Host wording when chat for this model can leave the home server. */
  leavingHomeLabel: string | null;
  active: boolean;
};

export type ModelCatalog = {
  supported: boolean;
  models: InstalledModel[];
  activeId: string | null;
};

const REMOTE_LOCATIONS = new Set([
  "remote",
  "cloud",
  "external",
  "away",
  "api",
  "off_box",
  "off-box",
]);

const LEAVES_HOME = "Leaves home";

export function isModelsRouteMissing(status: number): boolean {
  return status === 404 || status === 405 || status === 501;
}

/** Both keys carry the same id so either host decoder accepts the body. */
export function activeModelRequestBody(id: string): { id: string; model_id: string } {
  const trimmed = id.trim();
  return { id: trimmed, model_id: trimmed };
}

function stringField(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function firstArray(rec: Record<string, unknown>, keys: string[]): unknown[] | null {
  for (const key of keys) {
    if (Array.isArray(rec[key])) return rec[key] as unknown[];
  }
  return null;
}

function readActiveId(rec: Record<string, unknown>): string | null {
  const direct = rec.active_model_id ?? rec.active_id ?? rec.active_model;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const active = rec.active;
  if (typeof active === "string" && active.trim()) return active.trim();
  if (active && typeof active === "object" && !Array.isArray(active)) {
    const id = stringField(active as Record<string, unknown>, ["id", "model_id", "model"]);
    if (id) return id;
  }
  return null;
}

function parseInstalledModel(item: unknown): InstalledModel | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const rec = item as Record<string, unknown>;
  if (rec.installed === false) return null;
  const id = stringField(rec, ["id", "model_id", "model", "name"]);
  if (!id) return null;
  const name = stringField(rec, ["name", "label", "title"]) || id;
  const provider = stringField(rec, ["provider", "owned_by"]);
  const locationRaw = stringField(rec, ["location", "scope", "kind", "placement"]).toLowerCase();
  const explicit = rec.leaves_home ?? rec.leavesHome ?? rec.remote;
  let leaves = false;
  if (typeof explicit === "boolean") leaves = explicit;
  else if (explicit === "true" || explicit === 1) leaves = true;
  else if (REMOTE_LOCATIONS.has(locationRaw)) leaves = true;
  else if (rec.local === false) leaves = true;
  const custom = stringField(rec, [
    "leaves_home_label",
    "leaving_home_label",
    "remote_label",
    "badge",
  ]);
  return {
    id,
    name,
    provider: provider || null,
    location: leaves ? "remote" : "local",
    leavesHome: leaves,
    leavingHomeLabel: leaves ? custom || LEAVES_HOME : null,
    active: rec.active === true || rec.is_active === true,
  };
}

/** Parse a GET/POST body. Unsupported when the payload has no model list. */
export function parseModelCatalog(body: unknown): ModelCatalog {
  const unsupported: ModelCatalog = { supported: false, models: [], activeId: null };
  if (!body || typeof body !== "object" || Array.isArray(body)) return unsupported;
  const rec = body as Record<string, unknown>;
  const rawList = firstArray(rec, ["models", "installed", "installed_models", "data"]);
  if (!rawList) return unsupported;
  const models: InstalledModel[] = [];
  const seen = new Set<string>();
  for (const item of rawList) {
    const model = parseInstalledModel(item);
    if (!model || seen.has(model.id)) continue;
    seen.add(model.id);
    models.push(model);
  }
  const activeId = readActiveId(rec) || models.find((model) => model.active)?.id || null;
  return {
    supported: true,
    activeId,
    models: models.map((model) => ({
      ...model,
      active: activeId != null && model.id === activeId,
    })),
  };
}
