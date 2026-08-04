# Edge activity queue (app + browser extension)

Shared schema for offline / away Profile collectors. Data stays on the Owner’s home AtleyOS after flush.

## Item

```json
{
  "schema_version": 1,
  "device_id": "…",
  "source": "android_client | ios_client | browser_ext",
  "source_class": "calendar | contacts | browsing | tab_activity | …",
  "title": "short label",
  "body": "optional text",
  "occurred_at": 1710000000.0,
  "external_id": "optional stable id",
  "metadata": {},
  "status": "queued | sending | acked"
}
```

**Continuity:** `occurred_at` must never be stripped (personal AI temporal anchors).

## Flush paths

1. `POST /api/client/observation` — LAN / overlay / Away HTTPS session  
2. `POST /api/client/profile/ingest` — **Profile Continuity Channel** (Owner-enabled; Observation only)  
3. Local encrypted queue until a path works  

## Browser extension

See [`BROWSER_EXTENSION.md`](BROWSER_EXTENSION.md). Extension never implements Chat.
