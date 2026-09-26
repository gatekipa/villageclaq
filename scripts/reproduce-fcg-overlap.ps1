param(
  [string]$SourceReference = '00000000-0000-4000-8000-00000000e802',
  [switch]$ManualFirst
)
$source = Get-Content -Raw -LiteralPath 'scripts/test-relief-agency-receipts.sql'
$needle = "AS owner_retry;`nDO `$test`$"
$insertion = @'
AS owner_retry;
DO $probe$
DECLARE v_command jsonb; v_result jsonb; v_retry jsonb;
BEGIN
  v_command := jsonb_build_object(
    'action','money_in',
    'group_id','00000000-0000-4000-8000-00000000b801',
    'request_id','00000000-0000-4000-8000-00000000e80f',
    'amount','70','currency','USD',
    'occurred_at',to_char(transaction_timestamp() AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'account_id','00000000-0000-4000-8000-00000000e804',
    'fund_id','00000000-0000-4000-8000-00000000f801',
    'category_id','00000000-0000-4000-8000-00000000f803',
    'description','Same fictional Relief receipt entered manually',
    'reference_metadata',jsonb_build_object(
      'reference','__MANUAL_SOURCE_REFERENCE__'));
  PERFORM public.prepare_manual_financial_intent(v_command);
  RAISE NOTICE 'FCG_TIMESTAMP: %',v_command->>'occurred_at';
  v_result := public.post_manual_financial_intent(
    '00000000-0000-4000-8000-00000000e80f',v_command);
  v_retry := public.post_manual_financial_intent(
    '00000000-0000-4000-8000-00000000e80f',v_command);
  IF v_retry->>'decision'<>'IDEMPOTENT_RETURN_EXISTING'
  THEN RAISE EXCEPTION 'FCG_MANUAL_RETRY_DUPLICATED'; END IF;
  RAISE NOTICE 'FCG_MANUAL_DECISION: %',v_result->>'decision';
END
$probe$;
RESET ROLE;
DO $check$
DECLARE v_income_count integer; v_manual_audits integer;
BEGIN
  SELECT count(*) INTO v_income_count
  FROM public.financial_events e
  JOIN public.financial_postings p ON p.event_id=e.id
  WHERE e.group_id='00000000-0000-4000-8000-00000000b801'
    AND p.control_class='income' AND p.amount_signed=-70
    AND e.source_module IN ('relief','manual_finance');
  RAISE NOTICE 'FCG_OVERLAP_RESULT: income events %',v_income_count;
  IF v_income_count<>2 THEN RAISE EXCEPTION 'FCG_REPRO_EXPECTED_TWO_EVENTS'; END IF;
  SELECT count(*) INTO v_manual_audits
  FROM public.financial_events e
  JOIN financial_core.financial_event_audit_links a ON a.event_id=e.id
  WHERE e.group_id='00000000-0000-4000-8000-00000000b801'
    AND e.source_module='manual_finance'
    AND e.request_id='00000000-0000-4000-8000-00000000e80f';
  IF v_manual_audits<>1 THEN RAISE EXCEPTION 'FCG_MANUAL_AUDIT_MISSING'; END IF;
END
$check$;
SET LOCAL ROLE authenticated;
DO $test$
'@
$insertion = $insertion.Replace('__MANUAL_SOURCE_REFERENCE__', $SourceReference)
if ($ManualFirst) {
  $marker = 'SELECT public.post_agency_owner_recognition(jsonb_build_object('
  $offset = $source.IndexOf($marker)
  if ($offset -lt 0) { throw 'Owner recognition call not found' }
  $start = $insertion.IndexOf('DO $probe$')
  $end = $insertion.IndexOf('$probe$;', $start) + '$probe$;'.Length
  $probe = $insertion.Substring($start, $end - $start)
  $destination = $source.Insert($offset, $probe + "`n")
} else {
  if (-not $source.Contains($needle)) { throw 'Owner recognition probe marker not found' }
  $destination = $source.Replace($needle, $insertion)
}
[IO.File]::WriteAllText((Join-Path (Get-Location) '.vercel/fcg-overlap-repro.sql'), $destination)
