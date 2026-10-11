/** GET /api/client/search. Citations carry path, page, snippet, and open_url. */

export type SearchHit = {
  title: string;
  path: string;
  page: string;
  snippet: string;
  openUrl: string;
};

export type SearchSnapshot = {
  supported: boolean;
  embeddingRoute: string;
  cloud: boolean;
  hits: SearchHit[];
};

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.trim() : "";
}

export function isCloudEmbedding(route: string): boolean {
  return route.trim().toLowerCase() === "cloud";
}

export function cloudEmbeddingWarning(route: string): string {
  if (!isCloudEmbedding(route)) return "";
  return "This search used a cloud embedding route. The text can leave your home server.";
}

function hitFromRow(row: Record<string, unknown>): SearchHit | null {
  const path = text(row.path) || text(row.file) || text(row.source);
  const title = text(row.title) || text(row.name) || path;
  const snippet = text(row.snippet) || text(row.excerpt) || text(row.text);
  const openUrl = text(row.open_url) || text(row.url) || text(row.href);
  const page = text(row.page) || text(row.page_number);
  if (!title && !path && !snippet && !openUrl) return null;
  return { title: title || "Result", path, page, snippet, openUrl };
}

export function parseSearch(body: unknown): SearchSnapshot {
  const root = record(body);
  if (!root) return { supported: false, embeddingRoute: "", cloud: false, hits: [] };
  let raw: unknown[] | null = null;
  for (const key of ["results", "hits", "files", "citations", "items"]) {
    if (Array.isArray(root[key])) {
      raw = root[key] as unknown[];
      break;
    }
  }
  const embeddingRoute = text(root.embedding_route) || text(root.embeddingRoute);
  if (!raw && !embeddingRoute) return { supported: false, embeddingRoute: "", cloud: false, hits: [] };
  const hits: SearchHit[] = [];
  for (const item of raw || []) {
    const row = record(item);
    if (!row) continue;
    const hit = hitFromRow(row);
    if (hit) hits.push(hit);
  }
  return {
    supported: true,
    embeddingRoute,
    cloud: isCloudEmbedding(embeddingRoute),
    hits,
  };
}

export function citationsFromUnknown(value: unknown): SearchHit[] {
  if (Array.isArray(value)) return parseSearch({ results: value }).hits;
  return parseSearch(value).hits;
}
