export type Favorite = {
  id: string;
  entityId: string | null;
  label: string;
  state: string | null;
};

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function firstArray(obj: Record<string, unknown>): unknown[] | null {
  for (const key of ["favorites", "items", "entities", "data"]) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  const home = record(obj.home);
  if (home) {
    for (const key of ["favorites", "items"]) {
      if (Array.isArray(home[key])) return home[key] as unknown[];
    }
  }
  return null;
}

export function parseFavorites(body: unknown): { supported: boolean; favorites: Favorite[] } {
  const rec = record(body);
  if (!rec) return { supported: false, favorites: [] };
  const raw = firstArray(rec);
  if (!raw) return { supported: false, favorites: [] };
  const favorites: Favorite[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const row = record(item);
    if (!row) continue;
    const entityId = text(row.entity_id) || text(row.entityId) || null;
    const id = text(row.id) || text(row.favorite_id) || entityId || "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    favorites.push({
      id,
      entityId,
      label: text(row.label) || text(row.name) || text(row.title) || entityId || id,
      state: text(row.state) || text(row.status) || null,
    });
  }
  return { supported: true, favorites };
}

export function favoriteToggleBody(favorite: Pick<Favorite, "id" | "entityId">): {
  id: string;
  entity_id?: string;
} {
  return favorite.entityId ? { id: favorite.id, entity_id: favorite.entityId } : { id: favorite.id };
}
