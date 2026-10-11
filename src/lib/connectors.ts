/** GET /api/client/connectors. Hidden until the server publishes this route. */

export type ConnectorRow = {
  id: string;
  name: string;
  status: string;
  transport: string;
  detail: string;
};

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseConnectors(body: unknown): { supported: boolean; connectors: ConnectorRow[] } {
  const root = record(body);
  if (!root) return { supported: false, connectors: [] };
  let raw: unknown[] | null = null;
  for (const key of ["connectors", "mcp", "servers", "items"]) {
    if (Array.isArray(root[key])) {
      raw = root[key] as unknown[];
      break;
    }
  }
  if (!raw) return { supported: false, connectors: [] };
  const connectors: ConnectorRow[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const row = record(item);
    if (!row) continue;
    const name = text(row.name) || text(row.title) || text(row.id);
    const id = text(row.id) || name;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    connectors.push({
      id,
      name: name || id,
      status: text(row.status) || text(row.state),
      transport: text(row.transport) || text(row.kind) || text(row.type) || "mcp",
      detail: text(row.description) || text(row.detail) || text(row.summary),
    });
  }
  return { supported: true, connectors };
}
