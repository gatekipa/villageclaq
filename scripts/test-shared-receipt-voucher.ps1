# Generate a rollback-only source/voucher behavior probe on the real Relief
# agency fixture. Run its output against a local S0/M2-upgraded database.
$source = Get-Content -Raw -LiteralPath 'scripts/test-relief-agency-receipts.sql'
$paymentMarker = 'INSERT INTO public.payments(id,group_id,membership_id,amount,currency,'
if (-not $source.Contains($paymentMarker)) { throw 'Payment fixture marker not found' }
$source = $source.Insert($source.IndexOf($paymentMarker), @'
INSERT INTO public.financial_categories(id,group_id,name,category_class)
VALUES ('00000000-0000-4000-8000-00000000f805',
 '00000000-0000-4000-8000-00000000b802','Fictional Branch Income','income');
'@)
$branchMarker = 'SELECT public.post_branch_relief_receipt(jsonb_build_object('
if (-not $source.Contains($branchMarker)) { throw 'Branch posting marker not found' }
$source = $source.Insert($source.IndexOf($branchMarker), @'
SAVEPOINT manual_first_voucher_probe;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a801',true);
DO $manual_first$
DECLARE v_command jsonb; v_result jsonb;
BEGIN
  v_command:=jsonb_build_object(
    'action','money_in',
    'group_id','00000000-0000-4000-8000-00000000b801',
    'request_id','00000000-0000-4000-8000-00000000e8f4',
    'amount','70','currency','USD',
    'occurred_at',to_char(transaction_timestamp() AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'account_id','00000000-0000-4000-8000-00000000e804',
    'fund_id','00000000-0000-4000-8000-00000000f801',
    'category_id','00000000-0000-4000-8000-00000000f803',
    'reference_metadata',jsonb_build_object(
      'source_voucher','00000000-0000-4000-8000-00000000e802'));
  PERFORM public.prepare_manual_financial_intent(v_command);
  v_result:=public.post_manual_financial_intent(
    '00000000-0000-4000-8000-00000000e8f4',v_command);
  IF v_result->>'decision'<>'POSTED' THEN RAISE EXCEPTION 'MANUAL_FIRST_NOT_POSTED'; END IF;
END
$manual_first$;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a802',true);
DO $manual_first_module$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.post_branch_relief_receipt(jsonb_build_object(
      'payment_id','00000000-0000-4000-8000-00000000e802',
      'account_id','00000000-0000-4000-8000-00000000e801',
      'fund_id','00000000-0000-4000-8000-00000000f802'));
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLERRM LIKE '%OCCURRENCE_INTEGRITY%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'MANUAL_FIRST_MODULE_OVERLAP_ACCEPTED'; END IF;
  RAISE NOTICE 'MANUAL_FIRST_MODULE_DENIED';
END
$manual_first_module$;
ROLLBACK TO SAVEPOINT manual_first_voucher_probe;
'@)
$marker = "AS owner_retry;`nDO `$test`$"
if (-not $source.Contains($marker)) { throw 'Owner recognition marker not found' }
$probe = @'
AS owner_retry;
DO $voucher$
DECLARE v_command jsonb; v_result jsonb; v_retry jsonb;
  v_branch_command jsonb; v_denied boolean;
BEGIN
  v_command:=jsonb_build_object(
    'action','money_in',
    'group_id','00000000-0000-4000-8000-00000000b801',
    'request_id','00000000-0000-4000-8000-00000000e8f0',
    'amount','70','currency','USD',
    'occurred_at',to_char(transaction_timestamp() AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'account_id','00000000-0000-4000-8000-00000000e804',
    'fund_id','00000000-0000-4000-8000-00000000f801',
    'category_id','00000000-0000-4000-8000-00000000f803',
    'description','Fictional independent cash receipt',
    'reference_metadata',jsonb_build_object(
      'reference','fictional-provider-ref',
      'source_voucher','00000000-0000-4000-8000-00000000e8f0'));

  v_denied:=false;
  BEGIN
    PERFORM public.prepare_manual_financial_intent(
      v_command #- '{reference_metadata,source_voucher}');
    PERFORM public.post_manual_financial_intent(
      (v_command->>'request_id')::uuid,
      v_command #- '{reference_metadata,source_voucher}');
  EXCEPTION WHEN OTHERS THEN
    v_denied:=SQLERRM LIKE '%RECEIPT_VOUCHER_REQUIRED%';
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'MISSING_VOUCHER_ACCEPTED'; END IF;

  v_denied:=false;
  BEGIN
    PERFORM public.prepare_manual_financial_intent(
      jsonb_set(v_command,'{reference_metadata,source_voucher}',
        '"00000000-0000-4000-8000-00000000e802"'::jsonb));
    PERFORM public.post_manual_financial_intent(
      (v_command->>'request_id')::uuid,
      jsonb_set(v_command,'{reference_metadata,source_voucher}',
        '"00000000-0000-4000-8000-00000000e802"'::jsonb));
  EXCEPTION WHEN OTHERS THEN
    v_denied:=SQLERRM LIKE '%OCCURRENCE_INTEGRITY%';
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'MODULE_FIRST_OVERLAP_ACCEPTED'; END IF;

  PERFORM public.prepare_manual_financial_intent(v_command);
  v_result:=public.post_manual_financial_intent(
    (v_command->>'request_id')::uuid,v_command);
  v_retry:=public.post_manual_financial_intent(
    (v_command->>'request_id')::uuid,v_command);
  IF v_result->>'decision'<>'POSTED'
    OR v_retry->>'decision'<>'IDEMPOTENT_RETURN_EXISTING'
  THEN RAISE EXCEPTION 'VOUCHER_RETRY_FAILED'; END IF;

  v_denied:=false;
  BEGIN
    PERFORM public.prepare_manual_financial_intent(
      jsonb_set(v_command,'{amount}','"71"'::jsonb));
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLERRM LIKE '%CONFLICT%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'CHANGED_PAYLOAD_ACCEPTED'; END IF;

  v_denied:=false;
  BEGIN
    PERFORM public.prepare_manual_financial_intent(
      jsonb_set(v_command,'{request_id}',
        '"00000000-0000-4000-8000-00000000e8f1"'::jsonb));
    PERFORM public.post_manual_financial_intent(
      '00000000-0000-4000-8000-00000000e8f1',
      jsonb_set(v_command,'{request_id}',
        '"00000000-0000-4000-8000-00000000e8f1"'::jsonb));
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLERRM LIKE '%OCCURRENCE_INTEGRITY%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'DUPLICATE_MANUAL_VOUCHER_ACCEPTED'; END IF;

  v_branch_command:=v_command || jsonb_build_object(
    'group_id','00000000-0000-4000-8000-00000000b802',
    'request_id','00000000-0000-4000-8000-00000000e8f3',
    'account_id','00000000-0000-4000-8000-00000000e801',
    'fund_id','00000000-0000-4000-8000-00000000f802',
    'category_id','00000000-0000-4000-8000-00000000f805');
  PERFORM set_config('request.jwt.claim.sub',
    '00000000-0000-4000-8000-00000000a802',true);
  v_denied:=false;
  BEGIN
    PERFORM public.prepare_manual_financial_intent(v_branch_command);
    PERFORM public.post_manual_financial_intent(
      '00000000-0000-4000-8000-00000000e8f3',v_branch_command);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'CROSS_GROUP_PROBE_ERROR: %',SQLERRM;
    v_denied:=SQLERRM LIKE '%OCCURRENCE_INTEGRITY%'; END;
  PERFORM set_config('request.jwt.claim.sub',
    '00000000-0000-4000-8000-00000000a801',true);
  IF NOT v_denied THEN RAISE EXCEPTION 'CROSS_GROUP_SAME_ORG_VOUCHER_ACCEPTED'; END IF;

  v_command:=jsonb_set(jsonb_set(v_command,'{request_id}',
    '"00000000-0000-4000-8000-00000000e8f2"'::jsonb),
    '{reference_metadata,source_voucher}',
    '"00000000-0000-4000-8000-00000000e8f2"'::jsonb);
  PERFORM public.prepare_manual_financial_intent(v_command);
  v_result:=public.post_manual_financial_intent(
    '00000000-0000-4000-8000-00000000e8f2',v_command);
  IF v_result->>'decision'<>'POSTED' THEN RAISE EXCEPTION 'SECOND_RECEIPT_REJECTED'; END IF;
  RAISE NOTICE 'SHARED_VOUCHER_PASS: missing, module overlap, retry, conflict, same-org cross-group duplicate and distinct effects';
END
$voucher$;
DO $test$
'@
$out = $source.Replace($marker, $probe)
$ending = "RESET ROLE;`nROLLBACK;"
if (-not $out.Contains($ending)) { throw 'Rollback marker not found' }
$audit = @'
RESET ROLE;
DO $audit$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.financial_events e
    JOIN financial_core.financial_event_audit_links l ON l.event_id=e.id
    WHERE e.group_id='00000000-0000-4000-8000-00000000b801'
      AND e.source_module='manual_finance'
      AND e.request_id IN (
        '00000000-0000-4000-8000-00000000e8f0',
        '00000000-0000-4000-8000-00000000e8f2');
  IF v_count<>2 THEN RAISE EXCEPTION 'VOUCHER_AUDIT_COUNT %',v_count; END IF;
  RAISE NOTICE 'SHARED_VOUCHER_AUDIT_PASS: two distinct receipts, one audit each';
END
$audit$;
ROLLBACK;
'@
$out = $out.Replace($ending, $audit)
New-Item -ItemType Directory -Force -Path '.vercel' | Out-Null
Set-Content -LiteralPath '.vercel/fcg-shared-voucher-probe.sql' -Value $out -Encoding utf8
Write-Output '.vercel/fcg-shared-voucher-probe.sql'
