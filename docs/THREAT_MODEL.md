# Threat model — AtleyOS Client

## Assets

- Owner Profile Knowledge / Memory on the home host  
- Client API tokens and WireGuard keys on the EUD  
- Chat content in transit  

## Trust boundaries

| Zone | Trust |
|------|--------|
| Home AtleyOS host | Trusted for the Owner’s installation |
| Client app + OS Keystore | Trusted for device secrets |
| WireGuard overlay | Confidentiality/integrity for transit |
| STUN servers | See reflexive IP:port only |
| Owner / optional AtleyOS relay | Ciphertext-only; must not decrypt Chat/Observation |
| Public WAN | Untrusted — no API bind, no port forward |

## Threats & mitigations

| Threat | Mitigation |
|--------|------------|
| Internet scan finds home Chat API | No WAN bind; no port forward |
| Stolen EUD | Biometric unlock; revoke drops WG peer + tokens; SecureStore |
| Stolen pair QR | Short TTL; one-shot redeem |
| MITM to wrong host | Pin `host_public_key` from pairing |
| Malicious relay | Relay forwards WG only; no content inspection |
| Push leak | Opaque approval ids only |
| Token theft from prefs | Tokens in SecureStore / Keystore only |
| App vulnerability | Blast radius = that client’s keys after revoke |

## Explicit non-goals

- Supporting router port-forward as primary path  
- Trusting “same Wi‑Fi” alone after pairing for internet threat model  
- Shipping corpus to AtleyOS LLC  
