# PC-EVENTS — Bounded implementation ticket (NOT STARTED)

**Status:** HOLD until after PC-PAYMENT (recommended order)  
**Default legacy:** one −48h notice (`DEFAULT_EVENT_POLICY`)

## Adapter contract
- Anchor: event `starts_at`
- Resolved: cancelled | completed
- Reschedule: supersede unsent old-anchor; generate new-anchor
- Disposition of legacy `reminder_sent_at` one-bit flag: document cutover later (multi-occurrence needs per-occurrence state)
