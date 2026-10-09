import { ApiError, apiFetch } from "./api";
import { favoriteToggleBody, parseFavorites, type Favorite } from "./favoriteList";

export type { Favorite };

function missing(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 405 || error.status === 501);
}

export async function fetchFavorites(): Promise<{ supported: boolean; favorites: Favorite[] }> {
  let last: unknown;
  for (const path of ["/api/client/favorites", "/api/client/home/favorites"]) {
    try {
      const body = await apiFetch<unknown>(path);
      const parsed = parseFavorites(body);
      if (parsed.supported) return parsed;
    } catch (error) {
      last = error;
      if (missing(error)) continue;
      throw error;
    }
  }
  if (last && !missing(last)) throw last;
  return { supported: false, favorites: [] };
}

export async function toggleFavorite(favorite: Favorite): Promise<void> {
  await apiFetch("/api/client/favorites/toggle", {
    method: "POST",
    body: JSON.stringify(favoriteToggleBody(favorite)),
  });
}
