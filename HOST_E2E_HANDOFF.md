# Host → Client handoff (2026-08-04)

Owner asked the AtleyOS home-server chat to forward this after a full E2E host sweep.

## Host status
Host product is functional again (Immich recreated onto Owner-root compose; `atleyos.service` on canonical root). Away tunnel healthy.

## Client API bases (use these)
| Mode | Base URL | Notes |
|------|----------|--------|
| Away | `https://atleyos.atley.llc` | Client API only. `/` is API 404 by design. Health: `/api/client/health` → 200 |
| LAN | `http://192.168.8.140:8765` | Prefer over dashboard port. mDNS: `http://atleyos.local:8765` if phone resolves it |
| Dashboard | `http://192.168.8.140:8080` | Browser only — **not** the client API base |

## Auth
- Protected routes need `Authorization: Bearer <api_token>` from pairing.
- Unauthenticated chat → **401** (expected).
- Dashboard browser cookies do **not** apply to the client API.
- Host proved: fresh pair → `GET /api/client/status` + `POST /v1/chat/completions` **200** on both LAN and Away.
- If Chat still fails on a previously paired phone: almost certainly a **stale session from the wrong-root era** → re-pair with a fresh dashboard QR on home Wi‑Fi.

## Health facts
- `atleyos_root`: `/home/atleyos/.local/share/atleyos`
- Away enabled; `https_api_base=https://atleyos.atley.llc`
- Cloudflare Access outer layer may still be unset (device token still works)

## LAN app ports (side services)
Immich `:2283`, Nextcloud `:10081`, Home Assistant `:8123`, Jellyfin `:8097`, Anchor `:3848`, StrikeNote `:3847`.

## Client agent TODO
1. Ensure cached/default API bases match Away + LAN above (not `:8080`, not a stale tunnel hostname).
2. Make re-pair UX obvious when status is Connected but Chat 401s / fails.
3. Tell Owner: on home Wi‑Fi, scan a fresh QR, then send one Chat; paste exact error bubble if still broken.
