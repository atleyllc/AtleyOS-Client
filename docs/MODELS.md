# Chat models

The home server owns the model list. The phone reads it and can change the active chat model.

| Call | Purpose |
|------|---------|
| `GET /api/client/models` | Installed models and which one is active |
| `POST /api/client/models/active` | Set the active chat model |

Both use the same Bearer token as the other `/api/client/*` routes (port **8765**). The host contract lives in AtleyOS `docs/models.md`.

The client posts `{ "id", "model_id" }` with the same value, and accepts a list under `models` or `installed_models`. Local is the default. A remote model (`location: "remote"` or `leaves_home: true`) is labeled **Leaves home**, using the host’s label when it sends one.

A **404 / 405 / 501** means this home server is older and has no model route. Chat keeps working with whatever model the server is already using. The picker says so instead of failing the screen.

## Where it shows up

- **Settings → Chat model** — full list
- **Chat** — chip under the connection line opens the same list

Switching to a remote model asks first, because that chat can leave the home server.
