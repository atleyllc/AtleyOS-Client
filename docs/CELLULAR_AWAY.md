# Away access (always-on)

## End-user setup

1. On home AtleyOS: **Remote Access → Enable / refresh** until **Away ready**.
2. Install **AtleyOS Client** APK (not Expo Go).
3. On **home Wi‑Fi**: open the app → scan the pair QR.
4. Accept the Android **VPN permission** once.
5. Leave home — open Chat. No tunnel toggle.

The app keeps a split-tunnel WireGuard connection to home (`10.55.0.0/24` only). Normal internet stays on the phone’s network.

## Host side

AtleyOS maps UDP `51820` via UPnP / NAT-PMP / paired GL.iNet router API. Chat HTTP is never published on the WAN.

## Build APK locally

```bash
cd /home/atleyos/Projects/AtleyOSClient
npm run build:android:local
# → dist/AtleyOSClient-<version>-preview.apk
```

Releases: https://github.com/atleyllc/AtleyOS-Client/releases
