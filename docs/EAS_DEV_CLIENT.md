# Android APK — local build (no EAS cloud)

## Build on this machine

JDK 17 + Android SDK are installed under the user home:

- `~/.local/jdk-17`
- `~/.local/android`

```bash
cd /home/atleyos/Projects/AtleyOSClient
npm run build:android:local
```

Output:

```text
dist/AtleyOSClient-<version>-preview.apk
```

Install on the phone (enable “Install unknown apps”). This APK bundles JS — **no Expo Go / Metro** required.

Current build (example):

```text
dist/AtleyOSClient-1.0.0-preview.apk
```

Signed with the Expo/React Native **debug** keystore (fine for sideload testing; replace with a real upload keystore before Play Store).

## Publish as a GitHub Release

Needs a valid `gh` login and a GitHub remote (this repo’s `origin` is currently a local bare repo).

```bash
gh auth login -h github.com
# set a GitHub remote once, e.g.:
# git remote add github git@github.com:OWNER/AtleyOSClient.git

VERSION=1.0.0
gh release create "v${VERSION}" \
  "dist/AtleyOSClient-${VERSION}-preview.apk" \
  --repo OWNER/AtleyOSClient \
  --title "AtleyOS Client v${VERSION}" \
  --notes "Preview APK for away/cellular testing (debug-signed)."
```

## After install on phone

1. Home Wi‑Fi → open **AtleyOS Client**
2. Scan Remote Access pair QR
3. Settings → Export WireGuard conf → WireGuard app → enable tunnel  
   (in-app VPN still next)
4. Cellular → Chat

## Optional: EAS cloud

```bash
eas login
npm run build:android:preview
```
