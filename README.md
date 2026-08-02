# AtleyOS Client

Companion app for **end-user devices (EUDs)** — phones, tablets, and other clients paired to one AtleyOS home server.

**Model:** 1 server · many clients.

- Chat-first remote Shell
- Max Profile Observation (calendar, contacts, photos metadata, location, …)
- AtleyOS-native WireGuard remote access (no Tailscale required, no router port forwards)
- Home rail openers for Immich / Nextcloud / Jellyfin / Home Assistant

Host architecture: [`AtleyOS/docs/architecture/16-mobile-companion.md`](../AtleyOS/docs/architecture/16-mobile-companion.md)
MVP checklist: [`docs/MVP_ACCEPTANCE.md`](docs/MVP_ACCEPTANCE.md)

## Setup

```bash
cd AtleyOSClient
npm install
npx expo start
```
