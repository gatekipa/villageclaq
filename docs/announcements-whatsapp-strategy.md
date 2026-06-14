# Scheduled Announcements — WhatsApp Category Strategy (2026-06-13)

Status: **ACTIVE GUARDRAIL**. Scheduled-announcement WhatsApp remains
**deferred**. `villageclaq_announcement_v2` is **MARKETING-categorized and
not US-safe**. The audit script (`scripts/audit-whatsapp.mjs`) enforces this
document — changing the announcement template mapping, the cron's
direct-dispatch allowlisting, or adding announcement-named templates without
updating this strategy fails the audit.

## Why this document exists (evidence)

- Meta pauses MARKETING-category template delivery to US (`+1`) numbers:
  error **131049**, "not delivered to maintain healthy ecosystem
  engagement". The send API still returns a message id — failure surfaces
  only in the delivery webhook, so it is silent in the sending UI.
- Confirmed live on this WABA during the PR #16 release QA (2026-06-12):
  the MARKETING-categorized `villageclaq_event_reminder_v2` and
  `villageclaq_subscription_expiring` both returned wamids and then
  webhook-failed 131049 to the controlled US QA recipient.
- PR #17 (`villageclaq_account_access_notice`) and PR #18
  (`villageclaq_event_reminder`) fixed those two paths by remapping to
  Manager-verified UTILITY templates — both subsequently **delivered** to
  the same US recipient. Those QA results are the proof pattern this
  document relies on: Utility delivers to US, Marketing does not.
- VillageClaq's diaspora membership is largely US-based, so a
  Marketing-categorized announcement template silently misses a large share
  of members while appearing to send successfully.

## Current announcement code paths (audited 2026-06-13)

| Path | Mechanism | WhatsApp? | Template | Idempotency | US reach |
| --- | --- | --- | --- | --- | --- |
| Manual send (`src/app/[locale]/(dashboard)/dashboard/announcements/page.tsx` → `dispatchAnnouncementNotifications` → `notifyBulkFromClient` → `/api/whatsapp/send` per recipient) | client fire-and-forget | yes, only when the admin opts in (channel defaults are in-app ONLY: email/sms/whatsapp all default off) | `villageclaq_announcement_v2` via dispatcher type `announcement` | none (no dedupe; a double-submit re-sends) | attempted; fails 131049 at the webhook for US recipients |
| Scheduled cron (`src/app/api/cron/send-scheduled-announcements/route.ts`, every 5 min) | server direct dispatch (`dispatchWhatsApp`) per recipient, on the row's saved channels | yes, if the row's `channels` array includes `whatsapp` | same | row-level only: `sent_at IS NULL` candidate filter + race-gated flip. NO per-recipient idempotency — a mid-loop crash re-sends email/SMS/WhatsApp to recipients already processed on the next 5-min tick | same |
| Notification queue / drain | **no announcement path exists** — announcements are never queue-backed today | n/a | n/a | n/a | n/a |
| Audit allowlist | `send-scheduled-announcements` is one of exactly two cron routes permitted to call the dispatcher directly (the other is the queue drain) | — | — | — | — |

Conclusions from the audit: announcements **direct-dispatch** (never queue),
**use `villageclaq_announcement_v2`**, **can reach WhatsApp** when an admin
opts the announcement into that channel, **can reach US recipients** (and
silently fail there), have **no per-recipient idempotency**, and are
currently contained by the audit's direct-dispatch allowlist plus the
in-app-only channel defaults in the composer.

## Classification

| Class | Examples | WhatsApp policy |
| --- | --- | --- |
| 1. Operational account/group/service notices | meeting cancelled/moved, venue change for a specific event, dues deadline change, service outage affecting the group | MAY qualify for UTILITY — but only via a **separate, purpose-specific template** submitted and Manager-verified for that notice type (category AND WABA AND variable order — the PR #17/#18 procedure). Never via the generic announcement template. |
| 2. General community announcements | newsletters, community updates, general group news | Remain MARKETING. WhatsApp acceptable for non-US recipients only; **prefer in-app/email**. |
| 3. Promotional / engagement content | fundraising pushes, event promotion, growth/engagement campaigns | NEVER treat as Utility. Meta re-categorizes or rejects miscategorized templates and penalizes quality ratings. In-app/email, or Marketing WhatsApp where deliverable. |
| 4. US-recipient general announcements | any class-2/3 content to `+1` numbers | Do not use WhatsApp while the template is Marketing — route to **in-app/email** instead. |
| 5. Owner/admin-confirmed sends | anything where an admin explicitly opts an announcement into WhatsApp | The composer already requires opt-in (WhatsApp is off by default). Keep it opt-in; never default-on. |

## Recommendation (binding until superseded)

1. **Do not use WhatsApp for generic scheduled announcements to US
   recipients** while `villageclaq_announcement_v2` remains
   Marketing-categorized.
2. **Do not remap `villageclaq_announcement_v2`** (the `ANNOUNCEMENT`
   constant) to any Utility template without a specific, approved
   operational use case from class 1 — the audit pins the mapping.
3. **Prefer in-app/email for general announcements.** The composer's
   defaults already encode this.
4. **Create separate Utility templates only for specific operational
   announcement types** if we later define them (class 1), each one
   Manager-verified for category, WABA placement, and variable order
   before any code remap — the PR #17/#18 procedure.
5. If scheduled announcements are ever producerized, the conversion must
   bring per-recipient idempotency (per announcementId + userId, the event
   producer design) and replace the direct-dispatch allowlist entry in the
   same change — the audit enforces one or the other.

## Proposed follow-up (NOT implemented in this PR)

A low-risk runtime guard could skip the WhatsApp provider call for
`announcement`-type sends to US (`+1`) recipients while the template is
Marketing — saving pointless API calls and webhook-failure noise without
changing any member-visible behavior (those messages already never
deliver). It is deliberately NOT implemented here because it touches the
shared dispatcher used by every WhatsApp send and would need its own tests
and removal plan for the day a Utility announcement template exists.
Implement it, if desired, as a narrow follow-up PR: a type-scoped recipient
check in the announcement dispatch sites (not in the generic dispatcher),
with masked skip logging and audit coverage.

## UI guardrails (binding — added Build 7, 2026-06-14)

The composer and history UI must stay honest about what the system can prove.
These are enforced by `scripts/test-product-announcement-honesty.mjs` (static)
and `scripts/test-announcement-channels.mjs` (unit tests on
`src/lib/announcement-channels.ts`):

1. **Channel-availability truth model.** `src/lib/announcement-channels.ts` is
   the single source of truth for per-channel availability + derived status.
   WhatsApp announcement is `category_restricted` (`warn: true`) sourced from
   `TEMPLATE_METADATA.ANNOUNCEMENT.usBlocked` in `whatsapp-templates.ts`. The
   two must agree (audited).
2. **WhatsApp is opt-in, off by default, and never presented as guaranteed.**
   The composer keeps WhatsApp selectable (strategy class 5) but shows an amber
   warning affordance on the toggle, the `channelReasonWhatsappUsBlocked`
   disclosure, and a red `whatsappUsWarningBanner` in the send-confirm dialog.
   It is **not** disabled — Africa-only groups legitimately use it — but the US/
   not-delivery-confirmed truth is always disclosed.
3. **Status vocabulary.** The history badge reads **"Published"** (in-app only)
   or **"Published + sent"** (external channels dispatched best-effort), derived
   by `deriveAnnouncementStatus`. The word **"Sent"** as a standalone success
   badge, and **"Delivered"**, are forbidden for announcements until per-recipient
   delivery state is persisted — we do not claim delivery we cannot prove.
4. **External channels are best-effort.** Email/SMS/WhatsApp are fire-and-forget;
   the composer discloses `externalNotConfirmedNote` whenever any is selected.
5. **No misleading audit log.** The activity-log action splits into
   `announcement.created` / `announcement.scheduled` / `announcement.sent` by the
   actual state — never "sent" for a draft or a future-scheduled row.

## Future work for compliant WhatsApp announcements

Honest `delivered`/`failed`/`partially failed` statuses require per-recipient
delivery tracking. The path is: producerize announcements (queue-backed, with a
per-`(announcementId, userId, channel)` dispatch log written to the existing
`announcement_deliveries` table — see created-not-applied migration
`00106_announcement_delivery_idempotency.sql`), wire the webhook to flip
`delivered`, and **remove this cron from the audit's direct-dispatch allowlist in
the same change**. Compliant US WhatsApp delivery additionally requires a
Manager-verified UTILITY template per operational notice type (class 1) — never
remap the generic `villageclaq_announcement_v2` (MARKETING / not US-safe).
