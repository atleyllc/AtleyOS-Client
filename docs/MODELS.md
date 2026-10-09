# Chat models

The home server owns the model list. The phone reads it and can change the active chat model.

| Call | Purpose |
|------|---------|
| `GET /api/client/models` | Installed models, the active role map, and whether Ollama is up |
| `POST /api/client/models/active` | Set the model for one role |

Both use the same Bearer device token as the other `/api/client/*` routes (port **8765**). The host contract is AtleyOS `docs/models.md`.

Chat on the phone is the **conversation** role. The client posts:

```json
{ "role": "conversation", "model": "llama3.1:8b" }
```

`chat` is the same role as `conversation`. Other roles the host accepts are `coding`, `summarization`, and `lightweight_offline`. The model must already be installed.

A catalog looks like:

```json
{
  "ok": true,
  "chat_model": "phi4:latest",
  "active": { "conversation": "phi4:latest", "coding": null },
  "models": [
    {
      "name": "phi4:latest",
      "size_bytes": 9000000000,
      "status": "installed",
      "location": "local"
    }
  ],
  "ollama": { "reachable": true, "endpoint": "http://127.0.0.1:11434" },
  "remote": { "enabled": false, "leaves_machine": false }
}
```

The active chat model is `active.conversation`, then `chat_model`. Only `status: "installed"` rows are listed. Local is the default. `location: "remote"` (or `leaves_home: true`) is labeled **Leaves home**. When `ollama.reachable` is false, the picker says **Ollama not running at home**.

Older list shapes (`id`, `installed_models`, `active: { "id" }`) still parse. A **404 / 405 / 501** means this home server has no model route. Chat keeps working, and the picker says so.

## Where it shows up

- **Settings → Chat model** — full list
- **Chat** — chip under the connection line opens the same list

Switching to a remote model asks first, because that chat can leave the home server.
