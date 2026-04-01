# WhatsApp Message Templates — VillageClaq

Submit these templates in **Meta Business Manager** → WhatsApp Manager → Message Templates.

Each template must be submitted in **both English and French**.

---

## 1. villageclaq_payment_receipt
**Category:** UTILITY
**EN Body:** `Hi {{1}}, your payment of {{2}} for {{3}} in {{4}} has been received on {{5}}. Thank you!`
**FR Body:** `Bonjour {{1}}, votre paiement de {{2}} pour {{3}} dans {{4}} a été reçu le {{5}}. Merci !`
**Parameters:** 1=member_name, 2=amount, 3=contribution_type, 4=group_name, 5=date

## 2. villageclaq_payment_reminder
**Category:** UTILITY
**EN Body:** `Hi {{1}}, you have an outstanding payment of {{2}} for {{3}} due on {{4}} in {{5}}. Please make your payment to stay in good standing.`
**FR Body:** `Bonjour {{1}}, vous avez un paiement en attente de {{2}} pour {{3}} dû le {{4}} dans {{5}}. Veuillez effectuer votre paiement pour rester en règle.`
**Parameters:** 1=member_name, 2=amount, 3=contribution_type, 4=due_date, 5=group_name

## 3. villageclaq_event_reminder
**Category:** UTILITY
**EN Body:** `Hi {{1}}, reminder: {{2}} is scheduled for {{3}} at {{4}}. Group: {{5}}.`
**FR Body:** `Bonjour {{1}}, rappel : {{2}} est prévu le {{3}} à {{4}}. Groupe : {{5}}.`
**Parameters:** 1=member_name, 2=event_title, 3=event_date, 4=event_location, 5=group_name

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

## 8. villageclaq_announcement
**Category:** MARKETING
**EN Body:** `{{1}} — {{2}}: {{3}}`
**FR Body:** `{{1}} — {{2}} : {{3}}`
**Parameters:** 1=group_name, 2=announcement_title, 3=announcement_body

## 9. villageclaq_election_opened
**Category:** UTILITY
**EN Body:** `{{1}}: Elections are now open for "{{2}}". Positions: {{3}}. Cast your vote on the dashboard.`
**FR Body:** `{{1}} : Les élections sont ouvertes pour "{{2}}". Postes : {{3}}. Votez sur votre tableau de bord.`
**Parameters:** 1=group_name, 2=election_title, 3=positions

## 10. villageclaq_invitation
**Category:** UTILITY
**EN Body:** `{{1}} has invited you to join {{2}} on VillageClaq. Accept here: {{3}}`
**FR Body:** `{{1}} vous a invité(e) à rejoindre {{2}} sur VillageClaq. Acceptez ici : {{3}}`
**Parameters:** 1=inviter_name, 2=group_name, 3=accept_url

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

## 15. villageclaq_welcome
**Category:** UTILITY
**EN Body:** `Welcome {{1}}! You are now a member of {{2}} on VillageClaq. Open the app to get started.`
**FR Body:** `Bienvenue {{1}} ! Vous êtes maintenant membre de {{2}} sur VillageClaq. Ouvrez l'application pour commencer.`
**Parameters:** 1=member_name, 2=group_name

---

## Submission Notes

1. **Category**: Use UTILITY for transactional messages (receipts, reminders). Use MARKETING only for announcements.
2. **Language**: Submit each template in both `en` and `fr` using Meta's multi-language feature.
3. **Approval**: Templates take 24-48h to be reviewed by Meta. Keep body text professional and include the VillageClaq brand name.
4. **Buttons**: Optional — add a "View Dashboard" URL button if desired.
5. **Rate Limits**: Meta allows 1,000 messages/day for new Business accounts, scaling to 100K+ after quality ratings improve.
