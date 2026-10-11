# Install and test on Atley’s Android phone

Version **1.2.4** (Android `versionCode` 21; 1.2.3/20 is the monorepo move). This is a native build, not Expo Go. Away apps, photo backup, and LAN discovery need the APK. It installs over 1.2.1 (18), 1.2.0 (`versionCode` 15) and 1.1.2 (`versionCode` 14). `versionCode` skips to 18 so it is also above the 0.9.0-beta.9 phone build (17) from the AtleyOS repo.

The launcher, splash, and notification icon use the Atley OS gold mark from `assets/brand/` (first supplied for 0.9.0-beta.9). `npm test` and `npm run build:android:local` run `scripts/check-app-assets.mjs`, which fails if app.json points at a missing or old icon, if the stock Expo template icon is back, or if a tab has no bundled icon image.

This phone is a primary AtleyOS interface. Chat, the inbox, passwords, and storage live here. Notices stay in this app. It does not open ntfy or any other notice app.

Tab icons (Chat, Home, You, Inbox, Settings) are bundled PNG images. They do not use an icon font, so a missing Ionicons or Material font cannot leave empty boxes on Android or iOS. Builds before 1.2.0 set no tab icon at all, so React Navigation drew its `⏷` placeholder, which Android shows as a boxed X. The Inbox tab uses the inbox tray glyph.

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

The APK is `dist/AtleyOSClient-1.2.2-preview.apk`. Copy it to the phone and allow install from that source. It installs over 1.2.1, 1.2.0, and 1.1.2. The build script always runs `expo prebuild` (without `--clean`) so icon and splash changes reach `android/`.

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
8. Inbox: approvals from home, plus reminder, routine, alert, and Cursor plan rows. Each row shows what happened, when, and what to do, with the buttons home offers: **Fix it** (opens a new chat with the alert's details), **Retry** (backups), **Dismiss**, and for Cursor plans **Approve plan** / **Ask a follow-up**. A storage alert can only be fixed in chat or dismissed. Rows home resolved on its own disappear. Quiet hours are on this screen. The phone's notice shows the real title and one-line reason for alerts home writes itself (backup, storage, health, machines, approvals, Cursor jobs), e.g. “Backup failed — The backup drive is not mounted. Plug it in, then tap Retry.” Reminders and routines stay generic (“A reminder is ready.”) because they can quote your own content. With the app open, new rows arrive from `GET /api/client/events`; the phone reads the row by id before it shows the notice.
9. Home: Passwords opens Bitwarden when it is installed, otherwise the `https_url` or `server_url` from the passwords row. It does not open a LAN or Home VPN address. Storage, Search, Connectors, and Reminders appear only when those routes answer. Search, Connectors, and Reminders stay hidden while the server returns 404.
10. Approval push stays off until you turn **Approval push** on in the home dashboard (Remote Access), or home enables phone notices. Registering the phone does not flip that switch. After it is on, and `POST /api/client/push/register` exists, a closed app can receive a notice whose data is only an id. Opening the app loads the real row. If home names ntfy or another app, this phone skips that and keeps notices here.
11. Settings → **Check connection** names the address that answered.

## Test Away — `https://atleyos.atley.llc`

Leave home Wi‑Fi (cellular). Home VPN stays off.

1. Open Chat. Status should say Away HTTPS. Send one message.
2. If the tunnel is stopped, Chat names `https://atleyos.atley.llc` and says the tunnel is not up. It must not sit on `127.0.0.1` or hang only on the LAN address.
3. Home apps that have no Away URL will say they need home Wi‑Fi or Home VPN. Do not point Immich or Nextcloud at `https://atleyos.atley.llc` — that host is the client API only.
4. Optional: Settings → Advanced → Turn on Home VPN, then open a home app that only has a VPN address. Turn it off again. Normal internet should return.

## Chat (1.2.4)

- **Chats list** (history button): chats from home with auto titles, previews, and Today / Yesterday / Last 7 days groups. Search, and ⋯ on a chat for Rename, Pin, Share or export, Archive (Archived chats at the bottom), and Delete (asks first; removes the chat's attachments at home too).
- **Attach** (📎): photos or any file, up to 10 per message. Images up to 20 MB, other files up to 10 MB. Home keeps the original and gives the local vision model a smaller copy.
- **Stop** while a reply streams; what arrived so far is kept.
- **Copy** under each reply, code blocks have their own Copy. Long-press a message for Copy, **Edit and resend** (your messages), or **Regenerate** (the last reply). Errors show plainly with **Retry**.
- Replies render Markdown (headings, lists, code). A ↓ button jumps to the newest message.
- Each phone thread is its own chat at home (the phone sends the chat's id).
- Needs AtleyOS 0.10.0b6 or newer at home for attachments and chat management; older homes still chat.
- New native module: `expo-document-picker`, so this needs a new APK build.

## Away apps (1.2.2)

Photos (Immich), Files (Nextcloud), Media (Jellyfin), and Home (Home Assistant)
stay off the Cloudflare link: Jellyfin video there breaks Cloudflare's terms and
Immich uploads hit its 100 MB cap. Away, they go over the AtleyOS VPN.

- **Split tunnel.** The phone routes `10.55.0.0/24` and the home server's own
  address (`192.168.8.140/32`), nothing else. The address that works on home
  Wi‑Fi (`http://192.168.8.140:2283` and so on) works away too, so each native
  app is set up once with one server address.
- **Autopilot.** With Away apps on, the tunnel is off when the home server
  answers directly (home Wi‑Fi) and on everywhere else. Network changes re-check.
  Turning it on at home connects once so Android asks for the VPN permission.
- **Home tiles.** A tile opens the phone app when it's installed (Android by
  package, iOS by URL scheme), else the browser. Each tile's menu switches that
  app between phone app and browser. Away with Away apps off, a tile offers
  setup instead of opening a dead home address.
- **Status chip.** Home shows `Home Wi‑Fi`, `Away · apps on`,
  `Away · connecting`, or `Away · apps off`.
- **Setup screen** (Settings → Away apps, or Home → tile menu → Away apps):
  turn it on, the one router rule if the home server couldn't map UDP 51820
  itself (with copy buttons), and each app's server address. On iPhone, it
  links the WireGuard app and shares the AtleyOS config to it; turn on
  On‑Demand there (Cellular and Wi‑Fi, home Wi‑Fi excluded).
- **Server.** Needs AtleyOS 0.10.0b4 (`/api/client/away-apps`). It opens UDP
  51820 and the overlay in UFW at start, and reports this phone's last
  WireGuard handshake.

## Sign-in after server updates (1.2.2)

"Auth failed — stale pair" after a server deploy was a server bug: a request
that saved `last_seen` could overwrite a token refresh, so the phone's new
tokens stopped working. 0.10.0b4 fixes the store, and the previous token pair
stays valid for 10 minutes after a refresh. The phone also reuses tokens that
another request already refreshed instead of spending an old refresh token.

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
