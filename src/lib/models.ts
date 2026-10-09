import { ApiError, apiFetch } from "./api";
import {
  activeModelRequestBody,
  isModelsRouteMissing,
  parseModelCatalog,
  unsupportedModelCatalog,
  type ModelCatalog,
} from "./modelCatalog";

export type { InstalledModel, ModelCatalog } from "./modelCatalog";

function errorText(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const rec = body as Record<string, unknown>;
  return String(rec.message || rec.error || "");
}

/** Installed models and the active chat model. Older hosts return supported:false. */
export async function listInstalledModels(): Promise<ModelCatalog> {
  try {
    const body = await apiFetch<unknown>("/api/client/models");
    return parseModelCatalog(body);
  } catch (e) {
    if (e instanceof ApiError && isModelsRouteMissing(e.status)) {
      return unsupportedModelCatalog();
    }
    throw e;
  }
}

/** Set the home server’s active chat model, then return the catalog. */
export async function setActiveChatModel(id: string): Promise<ModelCatalog> {
  try {
    const body = await apiFetch<unknown>("/api/client/models/active", {
      method: "POST",
      body: JSON.stringify(activeModelRequestBody(id)),
    });
    const parsed = parseModelCatalog(body);
    if (parsed.supported) return parsed;
    return listInstalledModels();
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      const text = errorText(e.body);
      if (/model|unknown|install/i.test(text)) throw e;
      throw new Error(
        "This home server can’t change the chat model yet. Update AtleyOS at home, then try again.",
      );
    }
    throw e;
  }
}
