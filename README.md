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

## Project layout

```
app/                 Expo Router screens (pair, learn, tabs)
src/lib/             API, session (SecureStore), WG shim, Observation, openers
docs/                Acceptance, threat model, store privacy
```
