# VillageClaq Demo Runbook

How to demo VillageClaq to a prospective group (e.g. a njangi, alumni
union, or church group) — from group creation to launch readiness —
**without sending a single real message or touching real members' data.**

Audience: whoever is giving the demo (owner, sales, support).
Last updated: 2026-06-12 (Product Sprint B).

## The one rule

**Never demo inside a real customer group.** Always create a fresh demo
group (or reuse a previously created demo group) under a demo account.
Real groups contain real members with real phone numbers — actions inside
them can queue real WhatsApp/SMS/email.

## What is safe vs. what sends messages

| Action | Safe in a demo? | Why |
| --- | --- | --- |
| Create a group via onboarding | YES | Creates rows only |
| Stage invitations (email or phone) | CAUTION | Email invites send a real email immediately; phone invites queue a real WhatsApp notice. Use addresses/numbers YOU control, or stop at the filled-in form for the demo |
| Approve/reject pending join requests | YES (demo members only) | In-app effects only |
| Create contribution types / dues | YES | The auto-enroll trigger creates obligations — rows only, no messages |
| Record a payment | CAUTION | Recording/confirming a payment queues a WhatsApp receipt to that member. Only record against demo members whose numbers you control |
| Create an event | YES at demo time | No message is sent on creation. The daily reminder cron picks up events starting within 48h — if your demo event starts within 2 days and members have real contacts, reminders WILL go out the next morning. Use a far-future date, or delete/cancel the event after the demo |
| RSVP, minutes, announcements (in-app channel) | YES | In-app only |
| Announcements with WhatsApp/SMS/email channels ticked | NO | Sends to every member on those channels. Leave the channel boxes at the in-app default |
| "Send reminders" buttons (unpaid dues) | CAUTION | In-app notifications only today, but treat any "remind" button as a send |
| Anything in Settings → notification preferences | YES | Preferences only |

**Controlled QA sends** (when you genuinely need to show a live WhatsApp):
only to the controlled QA recipient ending **857**, in a QA-only group,
per the established QA procedure. Never from a customer demo group.

## The demo story (15 minutes, no sends)

1. **Create the group (3 min).** Sign in with the demo account →
   onboarding wizard. Talk through: group types (njangi/alumni/village/
   church), currency (XAF renders as FCFA everywhere), EN/FR group
   language. On the invite step, show the Email/Phone toggle and the
   validation — then SKIP ("I'll do this later") so nothing sends.
2. **Land on the dashboard (2 min).** Point at the Launch Readiness card:
   "the product tells you exactly what's left." Stats are honest zeros —
   walk the quick actions.
3. **Invite members (2 min).** Open Invitations. Show the email/phone
   modes, the duplicate protection (try the same contact twice — friendly
   error, nothing breaks), the join-code card and the printable QR flow.
   Use a contact YOU control if you want one real invitation to show the
   accept experience later.
4. **Set up dues (3 min).** Contributions → create a type (e.g. "Monthly
   Dues", 5,000 FCFA, monthly, enroll all). Show the matrix ("who owes at
   a glance"), the unpaid view, and record one cash payment against a demo
   member — point out the receipt link and the pending-confirmation flow
   for self-service payments.
5. **Create an event (2 min).** Events → create a meeting two months out
   (outside the 48h reminder window). Show the reminder hint ("members are
   reminded automatically — nothing to configure") and the location
   fallback note. RSVP as the demo member.
6. **Close on launch readiness (3 min).** Back to the dashboard: the
   checklist has visibly progressed. Walk the remaining items, then the
   bilingual story: flip to FR (language switcher) and show the same
   dashboard in French — this lands hard with diaspora groups.

## Launch Command Center as the demo backbone

Since Product Sprint B the demo has a home base: **/dashboard/launch**,
the Launch Command Center. It shows the activation stages (Basics →
Invite → Dues → First event → Reminders → Review → Go live) on one screen, so
the demo becomes "watch the stages light up" instead of hunting through
menus. Open it right after creating the demo group, walk each beat of the
story above in order, and return to it between beats — the progress you
create during the demo is reflected immediately, and the close ("the
product tells you exactly what's left") lands on the same screen you
started from.

The Launch Command Center also shows a **"Walking someone through a
demo?"** card with the same recommended path as this runbook, including
the no-send warning. If you lose your place mid-demo, the path is on
screen in front of you.

### Deep links for each demo beat

Use these to jump straight to a beat instead of navigating menus on a
screen-share:

| Demo beat | Route |
| --- | --- |
| Launch Command Center (start and finish here) | `/dashboard/launch` |
| Dashboard overview (honest zeros, quick actions) | `/dashboard` |
| Inviting members (review the screen only — do not submit real contacts) | `/dashboard/invitations` |
| Payment setup (dues types, matrix, record a payment) | `/dashboard/contributions` |
| Events and reminders (far-future date rule applies) | `/dashboard/events` |
| Launch readiness summary | `/dashboard/launch` |

Every safety rule in this runbook still applies on each of these screens.
Nothing on the Launch Command Center itself sends anything — it only
navigates — but the screens it links to can (see the safe/unsafe table
above).

## After the demo

- Cancel or far-future any event you created within the 48h window.
- Revoke any invitation you staged to a contact you don't control.
- Leave the demo group in place for next time (re-demos are faster), or
  ask an engineer to deactivate it.

## What never to do in production demos

- No WhatsApp/SMS/email channel selections on announcements.
- No "remind"/"resend" buttons against members you don't control.
- No Meta/WhatsApp template, WABA, or provider settings changes.
- No Supabase dashboard/SQL access during a customer demo.
- Never read out or display a member's full phone/email — the UI masks
  contacts by design; keep it that way on screen-shares.
