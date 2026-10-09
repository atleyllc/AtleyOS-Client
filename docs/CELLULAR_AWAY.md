# Away access (always-on)

## End-user setup

1. On home AtleyOS: **Remote Access → Enable**. Away HTTPS is ready only when the tunnel is up (`https://atleyos.atley.llc`).
2. Install **AtleyOS Client** APK (not Expo Go).
3. On **home Wi‑Fi**: open the app → scan the pair QR.
4. On the phone setup screen, tap **Check Away**, then copy the Photos and Files URLs into the Immich and Nextcloud apps.
5. Leave home — open Chat. Home VPN stays off unless you want the whole phone on the home network.

Chat uses LAN on home Wi‑Fi and Away HTTPS off Wi‑Fi. Optional Home VPN is a split tunnel (`10.55.0.0/24` only) and is not required for Chat.

## Host side

AtleyOS maps UDP `51820` via UPnP / NAT-PMP / paired GL.iNet router API. Chat HTTP is never published on the WAN.

## Build APK locally

```bash
cd /home/atleyos/Projects/AtleyOSClient
npm run build:android:local
# → dist/AtleyOSClient-<version>-preview.apk
```

Releases: https://github.com/atleyllc/AtleyOS-Client/releases
