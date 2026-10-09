/**
 * Client view of the home model catalog.
 * Host contract (AtleyOS docs/models.md, Bearer token, :8765):
 *   GET  /api/client/models
 *   POST /api/client/models/active  { "role": "conversation", "model": "<name>" }
 * Chat on the phone is the conversation role. Local is the default.
 * A missing route (404/405/501) means an older host — Chat still works.
 */

export type ModelLocation = "local" | "remote";

export type ModelRole = "conversation" | "coding" | "summarization" | "lightweight_offline";

export type ActiveRoleMap = Partial<Record<ModelRole, string | null>>;

export type InstalledModel = {
  id: string;
  name: string;
  provider: string | null;
  sizeBytes: number | null;
  location: ModelLocation;
  leavesHome: boolean;
  /** Host wording when chat for this model can leave the home server. */
  leavingHomeLabel: string | null;
  active: boolean;
};

export type ModelCatalog = {
  supported: boolean;
  models: InstalledModel[];
  /** Active conversation (Chat) model. */
  activeId: string | null;
  /** Role → installed model name. Null when the host did not send an active map. */
  activeRoles: ActiveRoleMap | null;
  ollamaReachable: boolean | null;
  /** Set when the host says Ollama is down. */
  ollamaMessage: string | null;
  remoteEnabled: boolean | null;
  remoteLeavesMachine: boolean | null;
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

const ROLE_KEYS: ModelRole[] = [
  "conversation",
  "coding",
  "summarization",
  "lightweight_offline",
];

const LEAVES_HOME = "Leaves home";

export const OLLAMA_DOWN_MESSAGE = "Ollama not running at home";

export function unsupportedModelCatalog(): ModelCatalog {
  return {
    supported: false,
    models: [],
    activeId: null,
    activeRoles: null,
    ollamaReachable: null,
    ollamaMessage: null,
    remoteEnabled: null,
    remoteLeavesMachine: null,
  };
}

export function isModelsRouteMissing(status: number): boolean {
  return status === 404 || status === 405 || status === 501;
}

/**
 * Body for POST /api/client/models/active.
 * The phone’s Chat picker is the conversation role. "chat" is the same role.
 */
export function activeModelRequestBody(
  model: string,
  role: string = "conversation",
): { role: string; model: string } {
  const trimmedRole = role.trim().toLowerCase();
  const normalized =
    trimmedRole === "" || trimmedRole === "chat" || trimmedRole === "conversation"
      ? "conversation"
      : trimmedRole;
  return { role: normalized, model: model.trim() };
}

export function formatModelSize(sizeBytes: number | null): string | null {
  if (sizeBytes == null || !Number.isFinite(sizeBytes) || sizeBytes < 0) return null;
  if (sizeBytes >= 1e9) {
    const gb = sizeBytes / 1e9;
    const text = gb >= 10 ? gb.toFixed(0) : gb.toFixed(1);
    return `${text} GB`;
  }
  if (sizeBytes >= 1e6) return `${Math.round(sizeBytes / 1e6)} MB`;
  if (sizeBytes >= 1e3) return `${Math.round(sizeBytes / 1e3)} KB`;
  return `${Math.round(sizeBytes)} B`;
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

function isRoleMap(active: unknown): active is Record<string, unknown> {
  if (!active || typeof active !== "object" || Array.isArray(active)) return false;
  const rec = active as Record<string, unknown>;
  if ("conversation" in rec || "chat" in rec) return true;
  return ROLE_KEYS.some((key) => key in rec);
}

function roleValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/** Host `active` object: role → model name or null. Chat is `conversation`. */
function readActiveRoles(active: unknown): ActiveRoleMap | null {
  if (!isRoleMap(active)) return null;
  const rec = active;
  const out: ActiveRoleMap = {};
  for (const key of ROLE_KEYS) {
    if (key in rec) out[key] = roleValue(rec[key]);
  }
  if (!("conversation" in rec) && "chat" in rec) {
    out.conversation = roleValue(rec.chat);
  }
  return out;
}

function readActiveId(rec: Record<string, unknown>, roles: ActiveRoleMap | null): string | null {
  if (roles) {
    if (roles.conversation) return roles.conversation;
    const chatModel = stringField(rec, ["chat_model"]);
    if (chatModel) return chatModel;
  } else {
    const chatModel = stringField(rec, ["chat_model"]);
    if (chatModel) return chatModel;
  }
  const direct = rec.active_model_id ?? rec.active_id ?? rec.active_model;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const active = rec.active;
  if (typeof active === "string" && active.trim()) return active.trim();
  if (active && typeof active === "object" && !Array.isArray(active) && !roles) {
    const id = stringField(active as Record<string, unknown>, ["id", "model_id", "model"]);
    if (id) return id;
  }
  return null;
}

function readOllama(rec: Record<string, unknown>): { reachable: boolean | null; message: string | null } {
  const ollama = rec.ollama;
  if (!ollama || typeof ollama !== "object" || Array.isArray(ollama)) {
    return { reachable: null, message: null };
  }
  const reachable = (ollama as Record<string, unknown>).reachable;
  if (reachable === false) return { reachable: false, message: OLLAMA_DOWN_MESSAGE };
  if (reachable === true) return { reachable: true, message: null };
  return { reachable: null, message: null };
}

function readRemote(rec: Record<string, unknown>): {
  enabled: boolean | null;
  leavesMachine: boolean | null;
} {
  const remote = rec.remote;
  if (!remote || typeof remote !== "object" || Array.isArray(remote)) {
    return { enabled: null, leavesMachine: null };
  }
  const body = remote as Record<string, unknown>;
  return {
    enabled: typeof body.enabled === "boolean" ? body.enabled : null,
    leavesMachine: typeof body.leaves_machine === "boolean" ? body.leaves_machine : null,
  };
}

function parseInstalledModel(item: unknown): InstalledModel | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const rec = item as Record<string, unknown>;
  if (rec.installed === false) return null;
  const status = stringField(rec, ["status"]).toLowerCase();
  if (status && status !== "installed") return null;
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
  const sizeBytes = typeof rec.size_bytes === "number" && Number.isFinite(rec.size_bytes)
    ? rec.size_bytes
    : null;
  return {
    id,
    name,
    provider: provider || null,
    sizeBytes,
    location: leaves ? "remote" : "local",
    leavesHome: leaves,
    leavingHomeLabel: leaves ? custom || LEAVES_HOME : null,
    active: rec.active === true || rec.is_active === true,
  };
}

/** Parse a GET/POST body. The host shape (name, status, active role map) wins. */
export function parseModelCatalog(body: unknown): ModelCatalog {
  const unsupported = unsupportedModelCatalog();
  if (!body || typeof body !== "object" || Array.isArray(body)) return unsupported;
  const rec = body as Record<string, unknown>;
  const rawList = firstArray(rec, ["models", "installed", "installed_models", "data"]);
  if (!rawList) return unsupported;
  const activeRoles = readActiveRoles(rec.active);
  const ollama = readOllama(rec);
  const remote = readRemote(rec);
  const models: InstalledModel[] = [];
  const seen = new Set<string>();
  for (const item of rawList) {
    const model = parseInstalledModel(item);
    if (!model || seen.has(model.id)) continue;
    seen.add(model.id);
    models.push(model);
  }
  const activeId =
    readActiveId(rec, activeRoles) || models.find((model) => model.active)?.id || null;
  return {
    supported: true,
    activeId,
    activeRoles,
    ollamaReachable: ollama.reachable,
    ollamaMessage: ollama.message,
    remoteEnabled: remote.enabled,
    remoteLeavesMachine: remote.leavesMachine,
    models: models.map((model) => ({
      ...model,
      active: activeId != null && model.id === activeId,
    })),
  };
}
