# App Store / Play privacy nutrition labels

Data collected by AtleyOS Mobile is sent **only to the Owner’s home AtleyOS server** over the encrypted overlay. It is **not** used for AtleyOS LLC advertising or third-party model training.

## Data types (when user grants OS permission)

| Type | Purpose | Linked to identity | Tracking |
|------|---------|--------------------|----------|
| Contact info | Profile people graph | On home Profile | No |
| Calendar / reminders | Routines & planning help | On home Profile | No |
| Photos / videos (metadata; media if granted) | Life continuity | On home Profile | No |
| Location | Significant places / context | On home Profile | No |
| Audio (voice notes) | Chat / transcription on host | On home Profile | No |
| Device ID | Paired device registry | Device id on home | No |
| Product interaction (Chat) | Help & Memory | On home Profile | No |

## Permissions rationale (copy for listings)

- **Camera** — scan home Remote Access pair QR  
- **Contacts / Calendar / Photos / Location / Mic** — teach your home Profile so AtleyOS can help you  
- **Face ID / Biometrics** — unlock the app before Chat/Actions  
- **VPN / Network Extension** (native build) — AtleyOS WireGuard tunnel to home  

## Operator controls

- Per-source pause and sync status in Settings  
- Revoke device from phone or home dashboard  
- Optional wipe of that device’s contributions on revoke (host)  
