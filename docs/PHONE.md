# Install and test on Atley’s Android phone

Version **1.1.0** (Android `versionCode` 12). This is a native build, not Expo Go. Home VPN, photo backup, and LAN discovery need the APK.

The private server repo was not readable while this was written. Away `https://atleyos.atley.llc/api/client/health` was up on 2026-10-09. Pairing and Chat still need a device token from a dashboard QR.

## Install

On a machine with this repo, JDK 17+, and the Android SDK (compile SDK 36):

```bash
cd AtleyOS-Client
npm ci --legacy-peer-deps
export JAVA_HOME="$HOME/.local/jdk-17"   # or any JDK 17+
export ANDROID_HOME="$HOME/.local/android"
npm run build:android:local
```

The APK is `dist/AtleyOSClient-1.1.0-preview.apk`. Copy it to the phone and allow install from that source. If an older AtleyOS Client is installed, install over it or remove it first so version 1.1.0 is the one that opens.

EAS, if you already have a logged-in account:

```bash
npm run build:android:preview
```

## Test on LAN — `http://192.168.8.140:8765`

Phone on the same Wi‑Fi as the server.

1. On the home dashboard: Settings → Remote Access → Show pair QR. Scan it in the app. The next screen is **Set up this phone**, not Chat.
2. **Check Away.** It names `https://atleyos.atley.llc`. If the tunnel is up, it answered. If not, the message says the tunnel is not up. It must not mention `127.0.0.1`.
3. **Copy Photos URL** and paste it into the Immich Android app. Expect `http://192.168.8.140:2283` unless home sent a different Photos address. **Copy Files URL** goes into the Nextcloud app, port `10081`.
4. Open Chat. The status line should say home Wi‑Fi. Send one message. The reply should grow if the server streams, or arrive as one bubble if it does not. Leave Chat and come back: the thread is still under **History**.
5. The model chip still lists installed models. Switching calls `POST /api/client/models/active` with `{"role":"conversation","model":"<name>"}`.
6. Home tab: **Open Photos / Files / Media / Home** uses the LAN address. The disclosure shows LAN, Away, and Home VPN. There is no office-lights sample.
7. You: Memory says the server does not share it yet. **Sync this phone** is the learning queue, not a fake biography.
8. Approvals: empty, or real rows from home. Allow and Deny. There is no “Load sample” button.
9. Settings → **Check connection** names the address that answered.

## Test Away — `https://atleyos.atley.llc`

Leave home Wi‑Fi (cellular). Home VPN stays off.

1. Open Chat. Status should say Away HTTPS. Send one message.
2. If the tunnel is stopped, Chat names `https://atleyos.atley.llc` and says the tunnel is not up. It must not sit on `127.0.0.1` or hang only on the LAN address.
3. Home apps that have no Away URL will say they need home Wi‑Fi or Home VPN. Do not point Immich or Nextcloud at `https://atleyos.atley.llc` — that host is the client API only.
4. Optional: Settings → Advanced → Turn on Home VPN, then open a home app that only has a VPN address. Turn it off again. Normal internet should return.

## Unpaired

Settings → Re-pair clears the session. Chat should say this phone isn’t paired and open pairing. It should not call `http://127.0.0.1:8765`.
