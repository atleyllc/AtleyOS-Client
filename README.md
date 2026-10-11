# AtleyOS Client

Primary phone app for **AtleyOS**. Chat, the inbox, passwords, and storage live here. Notices stay in this app.

**Model:** 1 server · many clients.

- Chat-first remote Shell  
- Max Profile Observation (calendar, contacts, photos metadata, location, …)  
- AtleyOS-native WireGuard remote access (no Tailscale required, no router port forwards)  
- Home rail openers for Immich / Nextcloud / Jellyfin / Home Assistant  

Host architecture: [`AtleyOS/docs/architecture/16-mobile-companion.md`](../AtleyOS/docs/architecture/16-mobile-companion.md)  
MVP checklist: [`docs/MVP_ACCEPTANCE.md`](docs/MVP_ACCEPTANCE.md)

## Requirements

- Node 22+ (nvm recommended)
- Expo CLI via project scripts
- Running AtleyOS host with **Settings → Remote Access** enabled

## Setup

```bash
cd AtleyOSClient
npm install
npx expo start
```

Press `a` for Android, `i` for iOS (macOS).  
For store / WireGuard Network Extension builds, use EAS (`eas.json`) with a custom dev client.

## First install path

1. Home: Settings → Remote Access → Enable → Show pair QR  
2. Client: open AtleyOS Client → scan QR (home Wi‑Fi)  
3. Phone setup: confirm Away (`https://atleyos.atley.llc` answers only when the tunnel is up), then copy the Photos (Immich) and Files (Nextcloud) URLs into those phone apps  
4. Learning is optional  
5. Chat. Home VPN stays off unless you want the whole phone on the home network  

Gap list: [`docs/PARITY-2026-10-09.md`](docs/PARITY-2026-10-09.md)

## Chat models

Settings → **Chat model**, and the model chip on Chat, list installed models from `GET /api/client/models` and set the active chat model with `POST /api/client/models/active` (`{"role":"conversation","model":"<name>"}`). Local models stay on the home server. A remote model is labeled **Leaves home**. If Ollama is down, the picker says **Ollama not running at home**. If the home server is older and that route 404s, Chat still works and the picker says this server has no model list. See [`docs/MODELS.md`](docs/MODELS.md).

Chat asks home to stream the reply, keeps `conversation_id` on the thread, and lists `GET /api/client/conversations` when that route returns them. A reply can show a tool call in plain language, an inline approval (a delete asks a second time and names undo), and a citation with path, page, snippet, and open link. If `embedding_route` is `cloud`, Chat says the text can leave the home server. The model chip is unchanged.

Inbox is the notifications center: reminders, routine results, approvals, and alerts, with quiet hours on the phone. `GET /api/client/events` stays open while the app is in use and reconnects when you come back. Push uses Expo only when home enables it and `POST /api/client/push/register` exists. This app does not open ntfy.

Passwords comes from the home-openers row `passwords` and opens `bitwarden://` or the https/server URL. Storage reads `GET /api/client/storage`. Search, Connectors, and Reminders stay off the Home tab until those routes exist. You saves Memory with **Save memory** when `GET /api/client/memory` exists. Install steps: [`docs/PHONE.md`](docs/PHONE.md).

## Connection status

An unpaired phone does not call `http://127.0.0.1:8765` (that address is the phone). Chat says the phone isn’t paired yet and opens the pair screen. When the phone is paired but home doesn’t answer, Chat names each address it tried — LAN (`http://192.168.8.140:8765`) or Away (`https://atleyos.atley.llc`) — and what to check. Away is used only when the home server says the tunnel is up.

## Project layout

```
app/                 Expo Router screens (pair, setup, learn, tabs)
src/lib/             API, session (SecureStore), models, chat, approvals, WG, Observation
src/components/      Shared sections and the chat model switcher
docs/                Parity, phone install, acceptance, threat model
```
