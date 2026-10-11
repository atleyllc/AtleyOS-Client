# Install and test on Atley’s Android phone

Version **1.2.1** (Android `versionCode` 18). This is a native build, not Expo Go. Home VPN, photo backup, and LAN discovery need the APK. It installs over 1.2.0 (`versionCode` 15) and 1.1.2 (`versionCode` 14). `versionCode` skips to 18 so it is also above the 0.9.0-beta.9 phone build (17) from the AtleyOS repo.

The launcher, splash, and notification icon use the Atley OS gold mark from `assets/brand/` (first supplied for 0.9.0-beta.9). `npm test` and `npm run build:android:local` run `scripts/check-app-assets.mjs`, which fails if app.json points at a missing or old icon, if the stock Expo template icon is back, or if a tab has no bundled icon image.

This phone is a primary AtleyOS interface. Chat, the inbox, passwords, and storage live here. Notices stay in this app. It does not open ntfy or any other notice app.

Tab icons (Chat, Home, You, Inbox, Settings) are bundled PNG images. They do not use an icon font, so a missing Ionicons or Material font cannot leave empty boxes on Android or iOS. Builds before 1.2.0 set no tab icon at all, so React Navigation drew its `⏷` placeholder, which Android shows as a boxed X. The Inbox tab uses the check glyph.

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

The APK is `dist/AtleyOSClient-1.2.1-preview.apk`. Copy it to the phone and allow install from that source. It installs over 1.2.0 and 1.1.2. The build script always runs `expo prebuild` (without `--clean`) so icon and splash changes reach `android/`.

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
8. Inbox: approvals from home, plus reminder, routine, and alert rows when the event stream sends them. Allow and Deny. A storage alert can only be dismissed. Quiet hours are on this screen. The notice says “Something is waiting.”, “A reminder is ready.”, “A routine finished.”, or “Home sent an alert.” and does not include the row text. With the app open, new rows arrive from `GET /api/client/events`. Coming back to the app reconnects that stream.
9. Home: Passwords opens Bitwarden when it is installed, otherwise the `https_url` or `server_url` from the passwords row. It does not open a LAN or Home VPN address. Storage, Search, Connectors, and Reminders appear only when those routes answer. Search, Connectors, and Reminders stay hidden while the server returns 404.
10. Approval push stays off until you turn **Approval push** on in the home dashboard (Remote Access), or home enables phone notices. Registering the phone does not flip that switch. After it is on, and `POST /api/client/push/register` exists, a closed app can receive a notice whose data is only an id. Opening the app loads the real row. If home names ntfy or another app, this phone skips that and keeps notices here.
11. Settings → **Check connection** names the address that answered.

## Test Away — `https://atleyos.atley.llc`

Leave home Wi‑Fi (cellular). Home VPN stays off.

1. Open Chat. Status should say Away HTTPS. Send one message.
2. If the tunnel is stopped, Chat names `https://atleyos.atley.llc` and says the tunnel is not up. It must not sit on `127.0.0.1` or hang only on the LAN address.
3. Home apps that have no Away URL will say they need home Wi‑Fi or Home VPN. Do not point Immich or Nextcloud at `https://atleyos.atley.llc` — that host is the client API only.
4. Optional: Settings → Advanced → Turn on Home VPN, then open a home app that only has a VPN address. Turn it off again. Normal internet should return.

## Unpaired

Settings → Re-pair clears the session. Chat should say this phone isn’t paired and open pairing. It should not call `http://127.0.0.1:8765`.

## Layout (1.2.1)

Each tab has one title and no navigator header. Cards are grouped with icons, status is a short chip (Up, Down, Waiting), and secondary actions such as addresses sit behind the ⋯ menu on each card.

- **Chat**: connection pill (Home Wi‑Fi, Away, Home VPN, Offline), model chip, history sheet, empty state with suggestions, bubbles, and a composer that stays above the keyboard.
- **Home**: a grid of home apps (one tap opens), then Tools: Machines, Coding jobs, AI usage, Connectors, Storage, Search, Reminders. A tool only shows when the server has its route.
- **You**: the phone sync row says how many items are waiting and why, shows progress while uploading, and drains the queue 100 at a time. The queue is de‑duplicated, so collecting again no longer grows it.
- **Inbox**: approvals with Allow and Deny, notices with a ⋯ menu, quiet hours in a sheet.
- **Machines**, **Coding jobs**, **AI usage**: read from `/api/client/machines`, `/api/client/coding`, and `/api/client/ai-usage`. Machine approvals can be decided here or in Inbox.

All glyphs are bundled PNGs from Lucide (ISC, `assets/icons/LICENSE-lucide.txt`) with @2x and @3x copies. No icon font is used.
