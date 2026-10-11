# Install and test on Atley’s Android phone

Version **1.1.2** (Android `versionCode` 14). This is a native build, not Expo Go. Home VPN, photo backup, and LAN discovery need the APK. It installs over 1.1.1 (`versionCode` 13).

Tab icons (Chat, Home, You, Approvals, Settings) are drawn in the app. They do not use an icon font, so a missing Ionicons or Material font cannot leave empty boxes on Android or iOS.

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

The APK is `dist/AtleyOSClient-1.1.2-preview.apk`. Copy it to the phone and allow install from that source. It installs over 1.1.1 (`versionCode` 13).

EAS, if you already have a logged-in account:

```bash
npm run build:android:preview
```

## Test on LAN — `http://192.168.8.140:8765`

Phone on the same Wi‑Fi as the server.

1. On the home dashboard: Settings → Remote Access → Show pair QR. Scan it in the app. The next screen is **Set up this phone**, not Chat.
2. **Check Away.** It names `https://atleyos.atley.llc`. If the tunnel is up, it answered. If not, the message says the tunnel is not up. It must not mention `127.0.0.1`.
3. **Copy Photos URL** and paste it into the Immich Android app. Expect `http://192.168.8.140:2283` unless home sent a different Photos address. **Copy Files URL** goes into the Nextcloud app, port `10081`.
4. Open Chat. The status line should say home Wi‑Fi. Send one message. The reply should grow as chunks arrive. A 400 that says no conversation model is selected is a real error: pick a model and send again. Leave Chat and come back: the thread is still under **History**, and opening a server conversation shows your turns as you, not as the assistant.
5. The model chip still lists installed models. Switching calls `POST /api/client/models/active` with `{"role":"conversation","model":"<name>"}`. Chat itself still sends `model: "atleyos"`.
6. Home tab: **Open Photos / Files / Media / Home** uses the LAN address. Files is port `10081`. Media is port `8097`. Status says up or down when home sends it. An app must not open `https://atleyos.atley.llc`.
7. You: **Save memory** is the filled button. Notes and **Forget** are inside **Notes**. A forgotten id that home does not have says so. It does not try a second delete.
8. Approvals: empty, or real rows from home. Allow and Deny. The screen shows whether home ran it (`executed`) and the server `message`. With the app open, new rows arrive from `GET /api/client/events`. The notice says “Something is waiting.” and does not include the approval text.
9. Approval push stays off until you turn **Approval push** on in the home dashboard (Remote Access). Registering the phone does not flip that switch. After it is on, a closed app can receive a notice whose data is only an id; opening the app loads the real row.
10. Settings → **Check connection** names the address that answered.

## Test Away — `https://atleyos.atley.llc`

Leave home Wi‑Fi (cellular). Home VPN stays off.

1. Open Chat. Status should say Away HTTPS. Send one message.
2. If the tunnel is stopped, Chat names `https://atleyos.atley.llc` and says the tunnel is not up. It must not sit on `127.0.0.1` or hang only on the LAN address.
3. Home apps that have no Away URL will say they need home Wi‑Fi or Home VPN. Do not point Immich or Nextcloud at `https://atleyos.atley.llc` — that host is the client API only.
4. Optional: Settings → Advanced → Turn on Home VPN, then open a home app that only has a VPN address. Turn it off again. Normal internet should return.

## Unpaired

Settings → Re-pair clears the session. Chat should say this phone isn’t paired and open pairing. It should not call `http://127.0.0.1:8765`.
