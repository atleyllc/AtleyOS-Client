# MVP acceptance checklist — AtleyOS Client

Companion for EUDs (iOS / Android). One AtleyOS server, many clients.  
**Model:** HTTPS-first Chat (no system VPN required); optional Home VPN; Profile Continuity over the internet.

Run once on **iOS** and once on **Android**.

| # | Step | iOS | Android |
|---|------|-----|---------|
| 1 | Home: Remote Access → Enable; Away access On (HTTPS URL) optional for cellular | | |
| 2 | Pair QR / payload visible | | |
| 3 | Install AtleyOS Client build | | |
| 4 | Scan QR on home Wi‑Fi; pairing succeeds | | |
| 5 | Chat on LAN **with Home VPN Off** | | |
| 6 | Learning consent → OS permission prompts | | |
| 7 | Chat: send message; reply from home | | |
| 8 | Observation sync status shows activity | | |
| 9 | Cellular: Chat via Away HTTPS with Home VPN **Off** | | |
| 10 | Profile Continuity: Observation uploads with VPN Off (or queues) | | |
| 11 | Optional Home VPN On does not blackhole phone internet; Off restores | | |
| 12 | Home revoke → client loses access | | |
| 13 | Chat/dashboard not casually open on WAN without Owner Away access | | |

**Exit:** rows green on both columns (Away HTTPS documented if tunnel not yet configured).

Friend-test: Enable Away access → pair → Chat on Wi‑Fi → Chat on cellular **without** VPN → sync Observation → optional Home VPN → revoke.
