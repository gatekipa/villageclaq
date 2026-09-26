-- R-012 read-only source inventory. Run only where record-read authority exists.
-- It inventories evidence; it does not choose an owner, opening balance, or
-- accounting treatment for an ambiguous historical source.
WITH source_rows AS (
  SELECT p.id plan_id,'plan'::text source_kind,p.id source_id,
    p.group_id owner_group_id,NULL::uuid collecting_group_id,
    NULL::uuid stated_owner_group_id,p.status::text source_status,
    p.currency,p.created_at source_at,NULL::numeric amount,
    pg_catalog.jsonb_build_object('shared_from_org',p.shared_from_org,
      'is_active',p.is_active) source_evidence
  FROM public.relief_plans p
  UNION ALL
  SELECT p.id,'enrollment',e.id,p.group_id,e.collecting_group_id,
    NULL::uuid,e.status::text,p.currency,e.enrolled_at,NULL::numeric,
    pg_catalog.jsonb_build_object('membership_id',e.membership_id,
      'operational_group_id',e.group_id,'is_active',e.is_active)
  FROM public.relief_enrollments e
  JOIN public.relief_plans p ON p.id=e.plan_id
  UNION ALL
  SELECT p.id,'receipt',r.id,p.group_id,r.group_id,
    NULL::uuid,r.status::text,r.currency,r.recorded_at,r.amount,
    pg_catalog.jsonb_build_object('reference',r.reference_number,
      'cash_class',r.cash_class,'settlement_status',r.settlement_status,
      'financial_event_id',r.financial_event_id,
      'recognition_event_id',r.recognition_event_id,
      'refund_event_id',r.refund_event_id,
      'agency_branch_event_id',agency.branch_event_id,
      'agency_owner_event_id',agency.owner_event_id)
  FROM public.payments r
  JOIN public.relief_plans p ON p.id=r.relief_plan_id
  LEFT JOIN financial_core.relief_agency_receipts agency
    ON agency.payment_id=r.id
  UNION ALL
  SELECT p.id,'claim',c.id,p.group_id,c.group_id,
    NULL::uuid,c.status::text,c.currency,c.created_at,c.amount,
    pg_catalog.jsonb_build_object('claimant_membership_id',
      c.claimant_membership_id,'approved_amount',c.amount_approved,
      'financial_event_id',c.financial_event_id)
  FROM public.relief_claims c
  JOIN public.relief_plans p ON p.id=c.plan_id
  UNION ALL
  SELECT p.id,'payout',x.id,p.group_id,c.group_id,
    NULL::uuid,'paid',c.currency,x.paid_at,x.amount,
    pg_catalog.jsonb_build_object('claim_id',x.claim_id,
      'reference',x.reference,'financial_event_id',c.financial_event_id)
  FROM public.relief_payouts x
  JOIN public.relief_claims c ON c.id=x.claim_id
  JOIN public.relief_plans p ON p.id=c.plan_id
  UNION ALL
  SELECT p.id,'remittance',r.id,p.group_id,r.branch_group_id,
    r.owner_group_id,r.status::text,r.currency,r.created_at,r.amount,
    pg_catalog.jsonb_build_object('reference',r.reference,
      'branch_event_id',r.branch_event_id,
      'owner_event_id',r.owner_event_id,
      'confirmed_date',r.confirmed_date)
  FROM public.relief_remittances r
  JOIN public.relief_plans p ON p.id=r.relief_plan_id
), source_context AS (
  SELECT source_rows.*,owner_group.organization_id owner_organization_id,
    collecting_group.organization_id collecting_organization_id,
    plan.currency plan_currency
  FROM source_rows
  JOIN public.relief_plans plan ON plan.id=source_rows.plan_id
  LEFT JOIN public.groups owner_group ON owner_group.id=source_rows.owner_group_id
  LEFT JOIN public.groups collecting_group
    ON collecting_group.id=source_rows.collecting_group_id
)
SELECT plan_id,source_kind,source_id,owner_group_id,collecting_group_id,
  stated_owner_group_id,source_status,currency,source_at,amount,source_evidence,
  pg_catalog.array_remove(ARRAY[
    CASE WHEN owner_organization_id IS NULL THEN 'owner_organization_missing' END,
    CASE WHEN plan_currency IS NULL OR currency IS NULL
      THEN 'currency_missing' END,
    CASE WHEN plan_currency IS NOT NULL AND currency IS NOT NULL
      AND plan_currency<>currency THEN 'plan_currency_mismatch' END,
    CASE WHEN collecting_group_id IS NOT NULL
      AND collecting_organization_id IS NULL
      THEN 'collecting_group_missing' END,
    CASE WHEN collecting_organization_id IS NOT NULL
      AND owner_organization_id IS DISTINCT FROM collecting_organization_id
      THEN 'cross_organization_source' END,
    CASE WHEN source_kind='remittance'
      AND stated_owner_group_id IS DISTINCT FROM owner_group_id
      THEN 'remittance_owner_unresolved' END,
    CASE WHEN source_kind='receipt' AND source_status='confirmed'
      AND source_evidence->>'financial_event_id' IS NULL
      THEN 'confirmed_receipt_opening_treatment_unresolved' END,
    CASE WHEN source_kind='receipt' AND source_status='confirmed'
      AND collecting_group_id IS DISTINCT FROM owner_group_id
      AND source_evidence->>'agency_owner_event_id' IS NULL
      THEN 'agency_owner_recognition_or_opening_unresolved' END,
    CASE WHEN source_kind='payout'
      AND source_evidence->>'financial_event_id' IS NULL
      THEN 'payout_opening_treatment_unresolved' END
  ]::text[],NULL) review_flags
FROM source_context
ORDER BY plan_id,source_at NULLS FIRST,source_kind,source_id;

-- Epoch boundaries must be reconciled with each source before activation.
SELECT plan.id plan_id,epoch.group_id,epoch.currency,epoch.id ledger_epoch_id,
  epoch.effective_from,epoch.effective_to,epoch.source_kind
FROM public.relief_plans plan
JOIN public.financial_ledger_epochs epoch ON epoch.group_id=plan.group_id
ORDER BY plan.id,epoch.currency,epoch.effective_from;
