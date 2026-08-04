# AtleyOS browser extension (Profile collector)

**Status:** Protocol stub for HTTPS-first / Profile Continuity.  
**Not Chat.** The extension only builds the Owner’s on-host Profile.

## Pairing

1. Owner enables Remote Access → Away access (HTTPS) + Profile Continuity.  
2. Dashboard shows a pair QR / token (same device pairing family, `platform: browser_ext`).  
3. Extension stores device session tokens in extension storage (never sync to vendor cloud).

## Collect

- `source_class`: `browsing`, `tab_activity`, `edge_activity`  
- Preserve `occurred_at` (Unix seconds)  
- Queue locally per [`EDGE_ACTIVITY_QUEUE.md`](EDGE_ACTIVITY_QUEUE.md)

## Upload

```http
POST {https_api_base}/api/client/profile/ingest
Authorization: Bearer <api_token>
Content-Type: application/json

{ "collector": "browser_ext", "items": [ /* ObsItem[] */ ] }
```

If PCC is disabled on the host, keep queuing until enabled or the user is on LAN.

## Non-goals

- Chat UI in the extension  
- Shipping Knowledge to AtleyOS LLC  
- Requiring Home VPN  
