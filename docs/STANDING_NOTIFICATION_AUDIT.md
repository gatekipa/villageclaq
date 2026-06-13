# Standing Notification Audit (WS6)

**Date:** 2026-06-13
**Scope:** Static code + migration audit of every code path that can change a
member's standing and what (if anything) it notifies. Internal developer
document — provider/queue/migration terms are used deliberately here. This is
the one place those terms are allowed; customer-facing copy stays in plain
language ("standing", "needs attention", "suspended", "reasons", "what to fix").

> **No sends were added in this sprint.** This sprint removed a side-effect, made
> recalculation an explicit admin action, and started persisting an override
> reason to the audit log. It did **not** add, widen, or newly invoke any
> notification dispatch. The single existing dispatch path is described below and
> is left exactly as-is.

---

## 1. Executive summary

There is exactly **one** path that can dispatch a standing notification: the
TypeScript `calculateStanding()` engine, and only when called with
`updateDb: true` **and** the freshly computed standing differs from the stored
value (a true transition). Everything else that changes standing — the three
database triggers and the two admin SQL functions — does so **silently**: no
in-app notice, no email, no SMS, no WhatsApp, and (for the triggers) no
old→new audit row.

Before this sprint a read hook could quietly take the dispatch path just by
*viewing* a member whose standing had gone stale (>5 min). That side-effect on
render is now removed. Recalculation is an explicit, admin-gated action, and the
manual override now records a reason in the audit log instead of discarding it.

---

## 2. The one dispatch path

`src/lib/calculate-standing.ts` → `calculateStanding(membershipId, groupId, { updateDb: true })`

Sequence when `updateDb` is set:

1. Read the current `memberships.standing` (the "old" value).
2. Write the newly computed `standing` + `standing_updated_at`.
3. **Only if `oldStanding && oldStanding !== standing`** (a real transition):
   - **Audit:** `logActivity(... action: "member.standing_changed" ...)` with
     `metadata: { oldStanding, newStanding }` into `group_audit_logs`.
   - **In-app:** insert one `notifications` row (localized title/body via the
     `standingChange` bilingual translator, transition-keyed copy).
   - **External channels**, each gated by `getEnabledChannels(..., "standing_changes", ...)`:
     - **Email** → `POST /api/email/send` (template `notification`).
     - **SMS** → `POST /api/sms/send` (template `standing-changed`; Africa-only
       enforcement lives downstream in the SMS route, not here).
     - **WhatsApp** → `POST /api/members/standing-notifications`, which invokes
       the server-side, queue-backed producer
       `produceStandingChangeNotification` (`src/lib/standing-change-producer.ts`,
       template `villageclaq_standing_changed`).

If no session token is available (the service-role / SSR caller path), external
channels are skipped and only the in-app row is written. If all three external
channel preferences are off, external dispatch is skipped entirely.

### Idempotency — WhatsApp only

Migration `00091_standing_change_notification_idempotency.sql` gives the
**WhatsApp** producer day-bucket idempotency: at most one WhatsApp standing
message per `membership / standing / day`. This dedupe covers WhatsApp **only**.

- **In-app, email, and SMS are NOT deduped.** They are guarded only by the
  `oldStanding !== standing` transition check inside `calculateStanding`. If two
  callers each observe a genuine transition (e.g. good→warning then back), each
  fires its own in-app/email/SMS. In practice the transition guard keeps this
  rare, but there is no per-day bucket on those three channels.

---

## 3. The silent paths (change standing, notify nothing)

### 3.1 Database triggers → `recalculate_membership_standing`

`00079_standing_recalc_triggers.sql` installs triggers on three tables that
recompute and write standing in-database:

- `payments`
- `event_attendances`
- `hosting_assignments`

These call the SQL `compute_member_standing` engine (`00080`) and update
`memberships.standing` directly. They emit **no notification of any kind** and
write **no old→new audit row**. A member can silently move good ⇄ warning ⇄
suspended purely because a payment, attendance mark, or hosting outcome was
recorded — with nothing logged about the transition and no one notified.

### 3.2 Admin RPCs `apply_standing_rules` / recalculate

`00080` ships `preview_standing_changes` (read-only, admin-gated) and
`apply_standing_rules` (admin-gated write). `apply_standing_rules` recomputes
and persists standing for the whole group when an admin changes the thresholds.
It is **silent**: it returns a count of changed members but dispatches **no**
notifications and writes **no per-member old→new audit row**.

### 3.3 SQL vs TS engine divergence (factor flags)

The TS engine (`calculate-standing.ts`) honors the per-factor on/off model and
the per-contribution-type exclusion list via `resolveStandingRules()`. The SQL
engine (`compute_member_standing`, `00080`) currently honors only the numeric
thresholds + the `enabled` opt-out — it does **not** yet read the `factors`
flags or `excluded_contribution_type_ids`. Migration `00101` (authored this
sprint, **NOT applied**) teaches the SQL engine to honor the factor flags.

Until `00101` is applied, a trigger-driven recalc (3.1) can overwrite a
factor-off display: a group that turned the `fines` factor off would see the TS
display ignore fines, but a `payments`/`attendance`/`hosting` trigger firing
`compute_member_standing` could recompute standing without the factor gate and
write a value the group asked not to be computed. Applying `00101` closes this
gap so both engines agree.

---

## 4. What this sprint shipped

1. **Side-effect-on-render removed.** The read hooks in
   `src/lib/hooks/use-member-standing.ts` no longer call `calculateStanding`
   with `updateDb: true`. Passively viewing a stale member no longer writes
   standing and can no longer dispatch a notification. Read = read.
2. **Recalculation is an explicit admin action.** A dedicated recalculate hook
   (`updateDb: true`) is the only client path that writes standing, invoked from
   an admin-gated control — never from a passive render.
3. **Override persists a reason.** The manual standing override on the member
   detail page now requires a non-empty reason and records it via `logActivity`
   (`action: "standing_overridden"`) into `group_audit_logs`, instead of
   discarding the reason as the decorative pre-sprint UI did.
4. **Configurable factor model (display).** `standing-rules.ts` +
   `standing-rules-tab.tsx` let a group toggle each factor on/off and exclude
   specific contribution types, persisted through `serializeStandingRules` into
   `groups.settings.standing_rules`. Fines and loans default **off**.

**Again: no notification send was added, widened, or newly invoked in this
sprint.** The dispatch in §2 is unchanged.

---

## 5. Recommendations / follow-ups (NOT built this sprint)

1. **Notify on trigger-driven changes — via a drain, not inline.** The silent
   triggers (§3.1) are the biggest gap: real standing changes that no one hears
   about. Do **not** add sends inside the DB triggers or inside the recalc RPC.
   Instead, have the triggers/RPC record the old→new transition (e.g. a pending
   row), and let a scheduled drain detect transitions and enqueue the existing
   producer. This keeps dispatch off the write path and reuses the one audited
   sender.
2. **Dedupe in-app / email / SMS like WhatsApp.** Extend the day-bucket
   idempotency model from `00091` (currently WhatsApp-only) to the other three
   channels so a flapping transition can't fan out duplicate notices.
3. **Apply migration `00101`.** Make the SQL engine honor the per-factor flags
   and exclusion list so a trigger-driven recalc cannot overwrite a factor-off
   display (§3.3). Until then, TS display and SQL writes can disagree.
4. **Per-member audit on RPC apply.** `apply_standing_rules` should write a
   per-member old→new audit row (matching the TS engine's
   `member.standing_changed`) so a bulk threshold change is traceable.

---

## 6. Quick reference

| Path | Changes standing | In-app | Email | SMS | WhatsApp | Audit old→new |
|------|------------------|--------|-------|-----|----------|---------------|
| `calculateStanding(updateDb:true)` on transition | yes | yes | yes (pref) | yes (pref) | yes (pref, day-deduped) | yes |
| DB triggers (payments / attendances / hosting) | yes | no | no | no | no | no |
| `apply_standing_rules` (admin RPC) | yes | no | no | no | no | no |
| Read hooks (`useMemberStanding*`) — post-sprint | **no** | no | no | no | no | no |
| Manual override (member detail) — post-sprint | yes | no | no | no | no | yes (reason) |

Idempotency note: the day-bucket dedupe (`00091`) covers the **WhatsApp** column
only. In-app / email / SMS rely solely on the transition guard.
