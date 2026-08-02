# MVP acceptance checklist — AtleyOS Mobile

Run once on **iOS** and once on **Android**.

| # | Step | iOS | Android |
|---|------|-----|---------|
| 1 | Home: Owner logged in; Settings → Remote Access → Enable | | |
| 2 | Pair QR / payload visible | | |
| 3 | Install AtleyOS Mobile build | | |
| 4 | Scan QR on home Wi‑Fi; pairing succeeds | | |
| 5 | Tunnel config ready / WG up; API reachable | | |
| 6 | Learning consent → OS permission prompts | | |
| 7 | Chat: send message; reply from home | | |
| 8 | Observation sync status shows activity | | |
| 9 | Cellular / off-LAN: hole punch or Owner relay | | |
| 10 | Chat still works off-LAN | | |
| 11 | Home revoke → phone loses access | | |
| 12 | WAN scan: no AtleyOS mobile API on router WAN | | |

**Exit:** all rows green on both columns (or Owner-relay documented for row 9).

Friend-test: enable Remote Access → install on iPhone **and** Android → pair → allow all learning → Chat from cellular → confirm sync → revoke.
