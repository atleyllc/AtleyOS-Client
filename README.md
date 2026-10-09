# AtleyOS Client

Companion app for **end-user devices (EUDs)** — phones, tablets, and other clients paired to one AtleyOS home server.

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
3. Allow learning permissions  
4. Chat + Observation sync  
5. Leave Wi‑Fi — tunnel uses hole punch / Owner relay

## Chat models

Settings → **Chat model**, and the model chip on Chat, list installed models from `GET /api/client/models` and set the active one with `POST /api/client/models/active`. Local models stay on the home server. A remote model is labeled **Leaves home**. If the home server is older and that route 404s, Chat still works and the picker says this server has no model list. See [`docs/MODELS.md`](docs/MODELS.md).

## Connection status

An unpaired phone does not call `http://127.0.0.1:8765` (that address is the phone). Chat says the phone isn’t paired yet and opens the pair screen. When the phone is paired but home doesn’t answer, Chat names each address it tried — LAN (`http://192.168.8.140:8765`) or Away (`https://atleyos.atley.llc`) — and what to check. Away is used only when the home server says the tunnel is up.

## Project layout

```
app/                 Expo Router screens (pair, learn, tabs)
src/lib/             API, session (SecureStore), models, WG shim, Observation, openers
src/components/      Chat model switcher
docs/                Acceptance, threat model, store privacy
```
