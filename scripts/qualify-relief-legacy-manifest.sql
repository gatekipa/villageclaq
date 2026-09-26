-- R-012 PREPARED ONLY. Do not execute against production until Jude approves
-- read-only production Relief record access. Run as a read-only SQL query and
-- retain any output in the ignored qualification workspace, never in Git.
-- S0/M2 source IDs and economic dimensions only: no names, contacts, claim
-- descriptions, document links, credentials, or secrets.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='30s';

SELECT p.id AS plan_id,p.group_id AS legacy_plan_group_id,
  g.organization_id,p.shared_from_org,p.collection_mode,p.claim_processing,
  g.currency AS legacy_owner_group_currency,p.is_active,
  p.created_at AS plan_created_at,
  (SELECT count(*) FROM public.relief_enrollments e
    WHERE e.plan_id=p.id) AS enrollment_count,
  (SELECT count(*) FROM public.payments pay
    WHERE pay.relief_plan_id=p.id) AS receipt_count,
  (SELECT count(*) FROM public.relief_claims c
    WHERE c.plan_id=p.id) AS claim_count,
  (SELECT count(*) FROM public.relief_remittances r
    WHERE r.relief_plan_id=p.id) AS remittance_count,
  CASE WHEN g.organization_id IS NULL THEN 'quarantine_missing_organization'
       ELSE 'owner_and_cash_class_unconfirmed' END AS cutover_classification
FROM public.relief_plans p
JOIN public.groups g ON g.id=p.group_id
ORDER BY p.id;

SELECT pay.id AS source_id,pay.relief_plan_id AS plan_id,
  pay.group_id AS collecting_group_id,pay.amount,pay.currency,pay.status,
  pay.recorded_at,pay.payment_date,pay.obligation_id
FROM public.payments pay
WHERE pay.relief_plan_id IS NOT NULL
ORDER BY pay.relief_plan_id,pay.recorded_at,pay.id;

SELECT e.id AS source_id,e.plan_id,e.collecting_group_id,
  m.group_id AS enrollment_membership_group_id,
  e.is_active,e.enrollment_type,e.enrolled_at
FROM public.relief_enrollments e
JOIN public.memberships m ON m.id=e.membership_id
ORDER BY e.plan_id,e.enrolled_at,e.id;

SELECT c.id AS source_id,c.plan_id,c.status,c.amount,c.created_at,
  c.reviewed_at,coalesce(sum(pay.amount),0) AS recorded_payout_amount,
  count(pay.id) AS recorded_payout_count
FROM public.relief_claims c
LEFT JOIN public.relief_payouts pay ON pay.claim_id=c.id
GROUP BY c.id,c.plan_id,c.status,c.amount,c.created_at,c.reviewed_at
ORDER BY c.plan_id,c.created_at,c.id;

SELECT pay.id AS source_id,c.plan_id,pay.claim_id,pay.amount,
  pay.payment_method,pay.paid_at
FROM public.relief_payouts pay
JOIN public.relief_claims c ON c.id=pay.claim_id
ORDER BY c.plan_id,pay.paid_at,pay.id;

SELECT r.id AS source_id,r.relief_plan_id AS plan_id,
  r.branch_group_id,r.amount,r.currency,r.status,r.remitted_date,
  r.confirmed_date,r.created_at
FROM public.relief_remittances r
ORDER BY r.relief_plan_id,r.created_at,r.id;
ROLLBACK;
