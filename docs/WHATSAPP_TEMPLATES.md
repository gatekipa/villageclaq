# WhatsApp Message Templates — VillageClaq

Submit these templates in **Meta Business Manager** → WhatsApp Manager → Message Templates.

Each template must be submitted in **both English and French**.

---

## 1. villageclaq_payment_receipt_v2

**Category:** UTILITY
**EN Body:**

```text
{{4}} via VillageClaq

Hi {{1}}, your payment of {{2}} for {{3}} was received on {{5}}. Thank you!
```

**FR Body:**

```text
{{4}} via VillageClaq

Bonjour {{1}}, votre paiement de {{2}} pour {{3}} a été reçu le {{5}}. Merci !
```

**Footer EN:** `VillageClaq — Your Community, Organized`
**Footer FR:** `VillageClaq — Votre communauté, organisée`
**Parameters:** 1=member_name, 2=amount, 3=contribution_type, 4=group_name, 5=date

## 2. villageclaq_payment_reminder_v2

**Category:** UTILITY
**EN Body:**

```text
{{5}} via VillageClaq

Hi {{1}}, you have an outstanding payment of {{2}} for {{3}} due on {{4}}. Please make your payment to stay in good standing.
```

**FR Body:**

```text
{{5}} via VillageClaq

Bonjour {{1}}, vous avez un paiement en attente de {{2}} pour {{3}}, dû le {{4}}. Veuillez effectuer votre paiement pour rester en règle.
```

**Footer EN:** `VillageClaq — Your Community, Organized`
**Footer FR:** `VillageClaq — Votre communauté, organisée`
**Parameters:** 1=member_name, 2=amount, 3=contribution_type, 4=due_date, 5=group_name

## 3. villageclaq_event_reminder_v2 — SUPERSEDED FOR RUNTIME USE

> **Superseded (2026-06-13):** Meta categorized this template as MARKETING
> (not the UTILITY recorded below) — marketing templates are blocked to US
> numbers, error 131049, confirmed live during the PR #16 release QA on
> 2026-06-12. The `event_reminder` runtime type now maps to the original
> `villageclaq_event_reminder` (see #3b), which was manually verified in
> WhatsApp Manager on 2026-06-13: EN Utility (Active - Quality pending),
> FR Utility, with the IDENTICAL 5-variable body order — so the remap is a
> pure name change. Retained for historical record.

**Category:** UTILITY (as submitted; Meta actually categorized it MARKETING)
**EN Body:**

```text
{{5}} via VillageClaq

Hi {{1}}, {{2}} is on {{3}} at {{4}}. Open the app for details.
```

**FR Body:**

```text
{{5}} via VillageClaq

Bonjour {{1}}, {{2}} a lieu le {{3}} à {{4}}. Ouvrez l'application pour les détails.
```

**Footer EN:** `VillageClaq — Your Community, Organized`
**Footer FR:** `VillageClaq — Votre communauté, organisée`
**Parameters:** 1=member_name, 2=event_title, 3=event_date, 4=event_location, 5=group_name

## 3b. villageclaq_event_reminder

**Category:** UTILITY (manually verified in WhatsApp Manager 2026-06-13: EN Active - Quality pending, FR Utility)
**Parameters:** 1=member_name, 2=event_title, 3=event_date, 4=event_location, 5=group_name

> The CURRENT runtime template for the `event_reminder` type
> (`WA_TEMPLATES.EVENT_REMINDER`) as of 2026-06-13, replacing the
> MARKETING-categorized v2 (#3). Verified in Manager: correct variable
> order in BOTH languages — note `{{4}}` is the event LOCATION, not the
> event time. Identical body order to v2, so the builder
> (`buildEventReminderParams`), dispatcher case, and producer payload are
> unchanged; the audit script blocks any mapping back to the Marketing v2.

## 4. villageclaq_hosting_reminder
**Category:** UTILITY
**EN Body:** `Hi {{1}}, you are hosting the next meeting on {{2}} for {{3}}. Please prepare accordingly.`
**FR Body:** `Bonjour {{1}}, vous accueillez la prochaine réunion le {{2}} pour {{3}}. Veuillez vous préparer en conséquence.`
**Parameters:** 1=member_name, 2=hosting_date, 3=group_name

## 5. villageclaq_minutes_published
**Category:** UTILITY
**EN Body:** `{{1}}: Meeting minutes for "{{2}}" ({{3}}) have been published. Check your dashboard for details.`
**FR Body:** `{{1}} : Le compte rendu de la réunion "{{2}}" ({{3}}) a été publié. Consultez votre tableau de bord pour plus de détails.`
**Parameters:** 1=group_name, 2=meeting_title, 3=meeting_date

## 6. villageclaq_relief_claim_approved
**Category:** UTILITY
**EN Body:** `Hi {{1}}, your {{2}} claim of {{3}} has been approved by {{4}}. Funds will be disbursed shortly.`
**FR Body:** `Bonjour {{1}}, votre demande de {{2}} de {{3}} a été approuvée par {{4}}. Les fonds seront versés sous peu.`
**Parameters:** 1=member_name, 2=claim_type, 3=amount, 4=group_name

## 7. villageclaq_relief_claim_denied
**Category:** UTILITY
**EN Body:** `Hi {{1}}, your {{2}} claim has been denied by {{4}}. Reason: {{3}}.`
**FR Body:** `Bonjour {{1}}, votre demande de {{2}} a été refusée par {{4}}. Raison : {{3}}.`
**Parameters:** 1=member_name, 2=claim_type, 3=reason, 4=group_name

## 8. villageclaq_announcement_v2 — MARKETING-RISK / NOT US-SAFE

> **Marketing-risk guardrail (2026-06-13):** this template is
> MARKETING-categorized, and Meta blocks marketing templates to US (+1)
> numbers — error 131049, which is SILENT at send time (the API returns a
> wamid; the failure only appears in the delivery webhook). The PR #16
> release QA (2026-06-12) proved this failure mode live on this WABA, and
> the PR #17/#18 Utility remaps (`villageclaq_account_access_notice`,
> `villageclaq_event_reminder`) proved that Manager-verified UTILITY
> templates DO deliver to the same US recipient — those findings are the
> basis for this guardrail. Scheduled-announcement WhatsApp is **deferred**:
> keep general announcements on in-app/email for US recipients, never remap
> this constant to a Utility template without an approved operational use
> case, and see `docs/announcements-whatsapp-strategy.md` (audit-enforced)
> for the classification and procedure.

**Category:** MARKETING
**EN Body:**

```text
{{1}} via VillageClaq

Announcement: {{2}}
{{3}}
```

**FR Body:**

```text
{{1}} via VillageClaq

Annonce : {{2}}
{{3}}
```

**Footer EN:** `VillageClaq — Your Community, Organized`
**Footer FR:** `VillageClaq — Votre communauté, organisée`
**Parameters:** 1=group_name, 2=announcement_title, 3=announcement_body

## 9. villageclaq_election_opened
**Category:** UTILITY
**EN Body:** `{{1}}: Elections are now open for "{{2}}". Positions: {{3}}. Cast your vote on the dashboard.`
**FR Body:** `{{1}} : Les élections sont ouvertes pour "{{2}}". Postes : {{3}}. Votez sur votre tableau de bord.`
**Parameters:** 1=group_name, 2=election_title, 3=positions

## 10. villageclaq_invitation

> **Superseded (2026-06-12):** approved as **MARKETING** (Meta blocks marketing
> templates to US numbers, error 131049). App sends now use the UTILITY
> replacement `villageclaq_member_invitation_notice` (#10b) via the
> `member_invitation` type — note `{{1}}` changes from the inviter to the
> invitee. This section is retained as the historical record.

**Category:** MARKETING (intended UTILITY)
**EN Body:** `{{1}} has invited you to join {{2}} on VillageClaq. Accept here: {{3}}`
**FR Body:** `{{1}} vous a invité(e) à rejoindre {{2}} sur VillageClaq. Acceptez ici : {{3}}`
**Parameters:** 1=inviter_name, 2=group_name, 3=accept_url

## 10b. villageclaq_member_invitation_notice

**Category:** UTILITY (approved EN + FR — confirmed in WhatsApp Manager 2026-06-12)
**Bodies:** see WhatsApp Manager for the approved copy. Parameter semantics
are confirmed and are what the app emits:
**Parameters:** 1=invitee_name, 2=group_name, 3=invitation_link

## 11. villageclaq_loan_approved
**Category:** UTILITY
**EN Body:** `Hi {{1}}, your loan of {{2}} from {{3}} has been approved. Funds will be disbursed per the agreed schedule.`
**FR Body:** `Bonjour {{1}}, votre prêt de {{2}} de {{3}} a été approuvé. Les fonds seront versés selon le calendrier convenu.`
**Parameters:** 1=member_name, 2=amount, 3=group_name

## 12. villageclaq_loan_overdue
**Category:** UTILITY
**EN Body:** `Hi {{1}}, your loan repayment of {{2}} was due on {{3}}. Please contact {{4}} to arrange payment.`
**FR Body:** `Bonjour {{1}}, votre remboursement de prêt de {{2}} était dû le {{3}}. Veuillez contacter {{4}} pour organiser le paiement.`
**Parameters:** 1=member_name, 2=amount, 3=due_date, 4=group_name

## 13. villageclaq_fine_issued
**Category:** UTILITY
**EN Body:** `Hi {{1}}, you have been fined: {{2}} — {{3}} ({{4}}). Reason: {{5}}.`
**FR Body:** `Bonjour {{1}}, une amende vous a été infligée : {{2}} — {{3}} ({{4}}). Raison : {{5}}.`
**Parameters:** 1=member_name, 2=fine_type, 3=amount, 4=group_name, 5=reason

## 14. villageclaq_standing_changed
**Category:** UTILITY
**EN Body:** `Hi {{1}}, your standing in {{3}} has been updated to: {{2}}.`
**FR Body:** `Bonjour {{1}}, votre statut dans {{3}} a été mis à jour : {{2}}.`
**Parameters:** 1=member_name, 2=new_standing, 3=group_name

## 15. villageclaq_welcome — SUPERSEDED

> **Superseded (2026-06-11):** Meta approved this template as MARKETING (not the
> intended UTILITY), and marketing templates are blocked to US numbers (error
> 131049). The app's `welcome` type now maps to `villageclaq_member_joined`
> (UTILITY) — copy in `docs/whatsapp-welcome-utility-template.md`. Retained for
> historical record; retire this template in Meta after the mapping is deployed.

**Category:** UTILITY (intended; approved as MARKETING)
**EN Body:** `Welcome {{1}}! You are now a member of {{2}} on VillageClaq. Open the app to get started.`
**FR Body:** `Bienvenue {{1}} ! Vous êtes maintenant membre de {{2}} sur VillageClaq. Ouvrez l'application pour commencer.`
**Parameters:** 1=member_name, 2=group_name

---

## 16. villageclaq_account_access_notice

**Category:** UTILITY (verified in WhatsApp Manager: EN + FR Active - Quality pending)
**EN Body:** `Your VillageClaq access for {{1}} will end in {{2}} day(s). Review your account status in VillageClaq.`
**FR Body:** `Votre accès à VillageClaq ({{1}}) prendra fin dans {{2}} jour(s). Consultez le statut de votre compte dans VillageClaq.`
**Parameters:** 1=group_or_organization_name, 2=days_left

> Runtime replacement (2026-06-13) for `villageclaq_subscription_expiring`,
> which Meta categorized as MARKETING and blocks to US numbers (error 131049,
> confirmed live in the PR #16 release QA on 2026-06-12). The app's
> `subscription_expiring` type now maps here via
> `WA_TEMPLATES.SUBSCRIPTION_EXPIRING`. **Variable semantics changed**: the
> old template's `{{1}}` was the plan/tier name; this template's `{{1}}` is
> the group/organization name — the producer, dispatcher, and builder were
> updated together, and the audit script blocks any mapping back to the
> Marketing template. Retire `villageclaq_subscription_expiring` in Meta once
> this mapping is deployed.

---

## Submission Notes

1. **Category**: Use UTILITY for transactional messages (receipts, reminders). Use MARKETING only for announcements.
2. **Language**: Submit each template in both `en` and `fr` using Meta's multi-language feature.
3. **Approval**: Templates take 24-48h to be reviewed by Meta. Keep body text professional and include the VillageClaq brand name.
4. **Buttons**: Optional — add a "View Dashboard" URL button if desired.
5. **Rate Limits**: Meta allows 1,000 messages/day for new Business accounts, scaling to 100K+ after quality ratings improve.
