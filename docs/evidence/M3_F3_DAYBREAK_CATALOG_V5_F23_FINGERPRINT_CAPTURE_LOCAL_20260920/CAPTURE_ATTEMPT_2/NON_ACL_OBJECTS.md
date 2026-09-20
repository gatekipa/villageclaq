# CAPTURE_ATTEMPT_2 — every non-ACL fingerprint difference

Phase: `after_successful_normal_application`. Compare unchanged. Acceptance unchanged.

All 347 non-ACL record pairs differ only in `owner`: expected `postgres`, observed `ubuntu`. `security_definer`, `functiondef`, and `rls_enabled` matched whenever present.

Nested `acl` on some `relations` / `schemas` / `routines` records also differs (owner-default privileges and the `service_role` remainder documented in DIFFERENCE_TABLE.md). Those nested ACL tuples are ACL differences, listed here only as owner rows.

## 00118_f3_bounded_financial_epoch_foundation.sql

| expectedSha256 | observedSha256 |
|---|---|
| `888c794355982346573a3353caa7fa74181bc0048cc95990de60416de893ab1d` | `556e331d47842748e3dd612aa3d0d2e8ca6f59771c248f67a72e5bb23facfaff` |

### relations (expectedCount=3, observedCount=3, onlyInExpected=3, onlyInObserved=3)

| object | expected owner | observed owner |
|---|---|---|
| `financial_private.epoch_transitions` | `postgres` | `ubuntu` |
| `financial_private.internal_financial_tenants` | `postgres` | `ubuntu` |
| `public.financial_ledger_epochs` | `postgres` | `ubuntu` |

### schema (expectedCount=1, observedCount=1, onlyInExpected=1, onlyInObserved=1)

| object | expected owner | observed owner |
|---|---|---|
| `financial_private` | `postgres` | `ubuntu` |

### schemas (expectedCount=1, observedCount=1, onlyInExpected=1, onlyInObserved=1)

| object | expected owner | observed owner |
|---|---|---|
| `financial_private` | `postgres` | `ubuntu` |

### types (expectedCount=3, observedCount=3, onlyInExpected=3, onlyInObserved=3)

| object | expected owner | observed owner |
|---|---|---|
| `financial_private.epoch_transitions (composite)` | `postgres` | `ubuntu` |
| `financial_private.internal_financial_tenants (composite)` | `postgres` | `ubuntu` |
| `public.financial_ledger_epochs (composite)` | `postgres` | `ubuntu` |

## 00119_f3_01_core_ledger_foundation.sql

| expectedSha256 | observedSha256 |
|---|---|
| `5e03111ffb34be3ed76a714370c93e70210a9741a25ac7b9158a9a9ad22f12f4` | `0c6e11b4c6473472e58bb6ef1b6c265f2259115cc2d50ab430e10d8e2a6c19f4` |

### function_owner (expectedCount=15, observedCount=15, onlyInExpected=7, onlyInObserved=7)

| object | expected owner | observed owner |
|---|---|---|
| `financial_core.currency_scale(p_currency text)` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_account()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_category()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_event_history()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_fund()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_posting_history()` | `postgres` | `ubuntu` |
| `financial_core.lock_financial_occurrence(p_group_id uuid, p_source_module text, p_source_record_id text, p_effect_kind text, p_ledger_epoch_id uuid)` | `postgres` | `ubuntu` |

### relations (expectedCount=8, observedCount=8, onlyInExpected=8, onlyInObserved=8)

| object | expected owner | observed owner |
|---|---|---|
| `financial_private.epoch_transitions` | `postgres` | `ubuntu` |
| `financial_private.internal_financial_tenants` | `postgres` | `ubuntu` |
| `public.financial_accounts` | `postgres` | `ubuntu` |
| `public.financial_categories` | `postgres` | `ubuntu` |
| `public.financial_events` | `postgres` | `ubuntu` |
| `public.financial_funds` | `postgres` | `ubuntu` |
| `public.financial_ledger_epochs` | `postgres` | `ubuntu` |
| `public.financial_postings` | `postgres` | `ubuntu` |

### routines (expectedCount=15, observedCount=15, onlyInExpected=7, onlyInObserved=7)

| object | expected owner | observed owner |
|---|---|---|
| `financial_core.currency_scale(p_currency text)` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_account()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_category()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_event_history()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_fund()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_posting_history()` | `postgres` | `ubuntu` |
| `financial_core.lock_financial_occurrence(p_group_id uuid, p_source_module text, p_source_record_id text, p_effect_kind text, p_ledger_epoch_id uuid)` | `postgres` | `ubuntu` |

### schema (expectedCount=2, observedCount=2, onlyInExpected=2, onlyInObserved=2)

| object | expected owner | observed owner |
|---|---|---|
| `financial_core` | `postgres` | `ubuntu` |
| `financial_private` | `postgres` | `ubuntu` |

### schemas (expectedCount=2, observedCount=2, onlyInExpected=2, onlyInObserved=2)

| object | expected owner | observed owner |
|---|---|---|
| `financial_core` | `postgres` | `ubuntu` |
| `financial_private` | `postgres` | `ubuntu` |

### types (expectedCount=15, observedCount=15, onlyInExpected=15, onlyInObserved=15)

| object | expected owner | observed owner |
|---|---|---|
| `financial_private.epoch_transitions (composite)` | `postgres` | `ubuntu` |
| `financial_private.internal_financial_tenants (composite)` | `postgres` | `ubuntu` |
| `public.financial_account_kind (enum)` | `postgres` | `ubuntu` |
| `public.financial_account_status (enum)` | `postgres` | `ubuntu` |
| `public.financial_accounts (composite)` | `postgres` | `ubuntu` |
| `public.financial_categories (composite)` | `postgres` | `ubuntu` |
| `public.financial_category_class (enum)` | `postgres` | `ubuntu` |
| `public.financial_config_status (enum)` | `postgres` | `ubuntu` |
| `public.financial_control_class (enum)` | `postgres` | `ubuntu` |
| `public.financial_event_class (enum)` | `postgres` | `ubuntu` |
| `public.financial_event_status (enum)` | `postgres` | `ubuntu` |
| `public.financial_events (composite)` | `postgres` | `ubuntu` |
| `public.financial_funds (composite)` | `postgres` | `ubuntu` |
| `public.financial_ledger_epochs (composite)` | `postgres` | `ubuntu` |
| `public.financial_postings (composite)` | `postgres` | `ubuntu` |

## 00120_f3_02_secure_posting_idempotency.sql

| expectedSha256 | observedSha256 |
|---|---|
| `35eba6966d2c077a9467f09adc6c85306b951c9d8388ee758a60d924c05ae51a` | `5b67f3ae0c5d37445d581e020be0cddeb3d9fc6827bb510f0915107b8bb36f5e` |

### function_owner (expectedCount=28, observedCount=28, onlyInExpected=16, onlyInObserved=16)

| object | expected owner | observed owner |
|---|---|---|
| `financial_core.currency_scale(p_currency text)` | `postgres` | `ubuntu` |
| `financial_core.f3_amount(p_value jsonb, p_currency text)` | `postgres` | `ubuntu` |
| `financial_core.f3_canonical(p_payload jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_currency(p_value jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_fingerprint(p_payload jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_timestamp(p_value jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_trim(p_text text)` | `postgres` | `ubuntu` |
| `financial_core.f3_uuid(p_value jsonb, p_optional boolean)` | `postgres` | `ubuntu` |
| `financial_core.guard_f3_payload()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_account()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_category()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_event_history()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_fund()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_posting_history()` | `postgres` | `ubuntu` |
| `financial_core.lock_f3_identity(p_group uuid, p_request uuid, p_module text, p_source text, p_effect text)` | `postgres` | `ubuntu` |
| `financial_core.lock_financial_occurrence(p_group_id uuid, p_source_module text, p_source_record_id text, p_effect_kind text, p_ledger_epoch_id uuid)` | `postgres` | `ubuntu` |

### relations (expectedCount=9, observedCount=9, onlyInExpected=9, onlyInObserved=9)

| object | expected owner | observed owner |
|---|---|---|
| `financial_core.posting_command_payloads` | `postgres` | `ubuntu` |
| `financial_private.epoch_transitions` | `postgres` | `ubuntu` |
| `financial_private.internal_financial_tenants` | `postgres` | `ubuntu` |
| `public.financial_accounts` | `postgres` | `ubuntu` |
| `public.financial_categories` | `postgres` | `ubuntu` |
| `public.financial_events` | `postgres` | `ubuntu` |
| `public.financial_funds` | `postgres` | `ubuntu` |
| `public.financial_ledger_epochs` | `postgres` | `ubuntu` |
| `public.financial_postings` | `postgres` | `ubuntu` |

### routines (expectedCount=28, observedCount=28, onlyInExpected=16, onlyInObserved=16)

| object | expected owner | observed owner |
|---|---|---|
| `financial_core.currency_scale(p_currency text)` | `postgres` | `ubuntu` |
| `financial_core.f3_amount(p_value jsonb, p_currency text)` | `postgres` | `ubuntu` |
| `financial_core.f3_canonical(p_payload jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_currency(p_value jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_fingerprint(p_payload jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_timestamp(p_value jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_trim(p_text text)` | `postgres` | `ubuntu` |
| `financial_core.f3_uuid(p_value jsonb, p_optional boolean)` | `postgres` | `ubuntu` |
| `financial_core.guard_f3_payload()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_account()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_category()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_event_history()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_fund()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_posting_history()` | `postgres` | `ubuntu` |
| `financial_core.lock_f3_identity(p_group uuid, p_request uuid, p_module text, p_source text, p_effect text)` | `postgres` | `ubuntu` |
| `financial_core.lock_financial_occurrence(p_group_id uuid, p_source_module text, p_source_record_id text, p_effect_kind text, p_ledger_epoch_id uuid)` | `postgres` | `ubuntu` |

### schema (expectedCount=2, observedCount=2, onlyInExpected=2, onlyInObserved=2)

| object | expected owner | observed owner |
|---|---|---|
| `financial_core` | `postgres` | `ubuntu` |
| `financial_private` | `postgres` | `ubuntu` |

### schemas (expectedCount=2, observedCount=2, onlyInExpected=2, onlyInObserved=2)

| object | expected owner | observed owner |
|---|---|---|
| `financial_core` | `postgres` | `ubuntu` |
| `financial_private` | `postgres` | `ubuntu` |

### types (expectedCount=16, observedCount=16, onlyInExpected=16, onlyInObserved=16)

| object | expected owner | observed owner |
|---|---|---|
| `financial_core.posting_command_payloads (composite)` | `postgres` | `ubuntu` |
| `financial_private.epoch_transitions (composite)` | `postgres` | `ubuntu` |
| `financial_private.internal_financial_tenants (composite)` | `postgres` | `ubuntu` |
| `public.financial_account_kind (enum)` | `postgres` | `ubuntu` |
| `public.financial_account_status (enum)` | `postgres` | `ubuntu` |
| `public.financial_accounts (composite)` | `postgres` | `ubuntu` |
| `public.financial_categories (composite)` | `postgres` | `ubuntu` |
| `public.financial_category_class (enum)` | `postgres` | `ubuntu` |
| `public.financial_config_status (enum)` | `postgres` | `ubuntu` |
| `public.financial_control_class (enum)` | `postgres` | `ubuntu` |
| `public.financial_event_class (enum)` | `postgres` | `ubuntu` |
| `public.financial_event_status (enum)` | `postgres` | `ubuntu` |
| `public.financial_events (composite)` | `postgres` | `ubuntu` |
| `public.financial_funds (composite)` | `postgres` | `ubuntu` |
| `public.financial_ledger_epochs (composite)` | `postgres` | `ubuntu` |
| `public.financial_postings (composite)` | `postgres` | `ubuntu` |

## 00121_f3_03_projection_read_proof.sql

| expectedSha256 | observedSha256 |
|---|---|
| `8f65797949d8c5afb7dfa99b8020da52385347099b2a5b9be5148b253e76bde6` | `340f5746700d74a92ae66c65d95ed074ed2d330d7001405aa80670d7c5b06752` |

### function_owner (expectedCount=32, observedCount=32, onlyInExpected=18, onlyInObserved=18)

| object | expected owner | observed owner |
|---|---|---|
| `financial_core.currency_scale(p_currency text)` | `postgres` | `ubuntu` |
| `financial_core.f3_amount(p_value jsonb, p_currency text)` | `postgres` | `ubuntu` |
| `financial_core.f3_canonical(p_payload jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_currency(p_value jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_fingerprint(p_payload jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_timestamp(p_value jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_trim(p_text text)` | `postgres` | `ubuntu` |
| `financial_core.f3_uuid(p_value jsonb, p_optional boolean)` | `postgres` | `ubuntu` |
| `financial_core.format_projection_amount(p_amount numeric, p_currency text)` | `postgres` | `ubuntu` |
| `financial_core.guard_f3_payload()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_account()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_category()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_event_history()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_fund()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_posting_history()` | `postgres` | `ubuntu` |
| `financial_core.lock_f3_identity(p_group uuid, p_request uuid, p_module text, p_source text, p_effect text)` | `postgres` | `ubuntu` |
| `financial_core.lock_financial_occurrence(p_group_id uuid, p_source_module text, p_source_record_id text, p_effect_kind text, p_ledger_epoch_id uuid)` | `postgres` | `ubuntu` |
| `financial_core.projection_cashbook_rows(p_group_id uuid, p_include_audit boolean)` | `postgres` | `ubuntu` |

### relations (expectedCount=9, observedCount=9, onlyInExpected=9, onlyInObserved=9)

| object | expected owner | observed owner |
|---|---|---|
| `financial_core.posting_command_payloads` | `postgres` | `ubuntu` |
| `financial_private.epoch_transitions` | `postgres` | `ubuntu` |
| `financial_private.internal_financial_tenants` | `postgres` | `ubuntu` |
| `public.financial_accounts` | `postgres` | `ubuntu` |
| `public.financial_categories` | `postgres` | `ubuntu` |
| `public.financial_events` | `postgres` | `ubuntu` |
| `public.financial_funds` | `postgres` | `ubuntu` |
| `public.financial_ledger_epochs` | `postgres` | `ubuntu` |
| `public.financial_postings` | `postgres` | `ubuntu` |

### routines (expectedCount=32, observedCount=32, onlyInExpected=18, onlyInObserved=18)

| object | expected owner | observed owner |
|---|---|---|
| `financial_core.currency_scale(p_currency text)` | `postgres` | `ubuntu` |
| `financial_core.f3_amount(p_value jsonb, p_currency text)` | `postgres` | `ubuntu` |
| `financial_core.f3_canonical(p_payload jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_currency(p_value jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_fingerprint(p_payload jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_timestamp(p_value jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_trim(p_text text)` | `postgres` | `ubuntu` |
| `financial_core.f3_uuid(p_value jsonb, p_optional boolean)` | `postgres` | `ubuntu` |
| `financial_core.format_projection_amount(p_amount numeric, p_currency text)` | `postgres` | `ubuntu` |
| `financial_core.guard_f3_payload()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_account()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_category()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_event_history()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_fund()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_posting_history()` | `postgres` | `ubuntu` |
| `financial_core.lock_f3_identity(p_group uuid, p_request uuid, p_module text, p_source text, p_effect text)` | `postgres` | `ubuntu` |
| `financial_core.lock_financial_occurrence(p_group_id uuid, p_source_module text, p_source_record_id text, p_effect_kind text, p_ledger_epoch_id uuid)` | `postgres` | `ubuntu` |
| `financial_core.projection_cashbook_rows(p_group_id uuid, p_include_audit boolean)` | `postgres` | `ubuntu` |

### schema (expectedCount=2, observedCount=2, onlyInExpected=2, onlyInObserved=2)

| object | expected owner | observed owner |
|---|---|---|
| `financial_core` | `postgres` | `ubuntu` |
| `financial_private` | `postgres` | `ubuntu` |

### schemas (expectedCount=2, observedCount=2, onlyInExpected=2, onlyInObserved=2)

| object | expected owner | observed owner |
|---|---|---|
| `financial_core` | `postgres` | `ubuntu` |
| `financial_private` | `postgres` | `ubuntu` |

### types (expectedCount=16, observedCount=16, onlyInExpected=16, onlyInObserved=16)

| object | expected owner | observed owner |
|---|---|---|
| `financial_core.posting_command_payloads (composite)` | `postgres` | `ubuntu` |
| `financial_private.epoch_transitions (composite)` | `postgres` | `ubuntu` |
| `financial_private.internal_financial_tenants (composite)` | `postgres` | `ubuntu` |
| `public.financial_account_kind (enum)` | `postgres` | `ubuntu` |
| `public.financial_account_status (enum)` | `postgres` | `ubuntu` |
| `public.financial_accounts (composite)` | `postgres` | `ubuntu` |
| `public.financial_categories (composite)` | `postgres` | `ubuntu` |
| `public.financial_category_class (enum)` | `postgres` | `ubuntu` |
| `public.financial_config_status (enum)` | `postgres` | `ubuntu` |
| `public.financial_control_class (enum)` | `postgres` | `ubuntu` |
| `public.financial_event_class (enum)` | `postgres` | `ubuntu` |
| `public.financial_event_status (enum)` | `postgres` | `ubuntu` |
| `public.financial_events (composite)` | `postgres` | `ubuntu` |
| `public.financial_funds (composite)` | `postgres` | `ubuntu` |
| `public.financial_ledger_epochs (composite)` | `postgres` | `ubuntu` |
| `public.financial_postings (composite)` | `postgres` | `ubuntu` |

## 00122_f3_04_correction_reversal.sql

| expectedSha256 | observedSha256 |
|---|---|
| `6e3240759aec64d4692422aac006b4fb865e3039832be84efea86b39c0253175` | `75c4f8b0c77d56955611fc9de57b2c817bcc85c02ded779a7f79e0f499e9fcbc` |

### function_owner (expectedCount=46, observedCount=46, onlyInExpected=26, onlyInObserved=26)

| object | expected owner | observed owner |
|---|---|---|
| `financial_core.currency_scale(p_currency text)` | `postgres` | `ubuntu` |
| `financial_core.f3_amount(p_value jsonb, p_currency text)` | `postgres` | `ubuntu` |
| `financial_core.f3_canonical(p_payload jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_correction_canonical(p jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_correction_child_id(g uuid, r uuid, role text)` | `postgres` | `ubuntu` |
| `financial_core.f3_correction_fingerprint(p jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_correction_posting_json(id uuid, event_id uuid, g uuid, epoch uuid, c text, occurred timestamp with time zone, amount numeric, control financial_control_class, account uuid, fund uuid, category uuid, cat_class financial_category_class, member uuid, project uuid)` | `postgres` | `ubuntu` |
| `financial_core.f3_correction_reason(p jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_correction_signed_amount(p numeric, c text)` | `postgres` | `ubuntu` |
| `financial_core.f3_correction_timestamp(p timestamp with time zone)` | `postgres` | `ubuntu` |
| `financial_core.f3_currency(p_value jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_fingerprint(p_payload jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_timestamp(p_value jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_trim(p_text text)` | `postgres` | `ubuntu` |
| `financial_core.f3_uuid(p_value jsonb, p_optional boolean)` | `postgres` | `ubuntu` |
| `financial_core.format_projection_amount(p_amount numeric, p_currency text)` | `postgres` | `ubuntu` |
| `financial_core.guard_f3_correction_payload()` | `postgres` | `ubuntu` |
| `financial_core.guard_f3_payload()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_account()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_category()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_event_history()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_fund()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_posting_history()` | `postgres` | `ubuntu` |
| `financial_core.lock_f3_identity(p_group uuid, p_request uuid, p_module text, p_source text, p_effect text)` | `postgres` | `ubuntu` |
| `financial_core.lock_financial_occurrence(p_group_id uuid, p_source_module text, p_source_record_id text, p_effect_kind text, p_ledger_epoch_id uuid)` | `postgres` | `ubuntu` |
| `financial_core.projection_cashbook_rows(p_group_id uuid, p_include_audit boolean)` | `postgres` | `ubuntu` |

### relations (expectedCount=10, observedCount=10, onlyInExpected=10, onlyInObserved=10)

| object | expected owner | observed owner |
|---|---|---|
| `financial_core.correction_command_payloads` | `postgres` | `ubuntu` |
| `financial_core.posting_command_payloads` | `postgres` | `ubuntu` |
| `financial_private.epoch_transitions` | `postgres` | `ubuntu` |
| `financial_private.internal_financial_tenants` | `postgres` | `ubuntu` |
| `public.financial_accounts` | `postgres` | `ubuntu` |
| `public.financial_categories` | `postgres` | `ubuntu` |
| `public.financial_events` | `postgres` | `ubuntu` |
| `public.financial_funds` | `postgres` | `ubuntu` |
| `public.financial_ledger_epochs` | `postgres` | `ubuntu` |
| `public.financial_postings` | `postgres` | `ubuntu` |

### routines (expectedCount=46, observedCount=46, onlyInExpected=26, onlyInObserved=26)

| object | expected owner | observed owner |
|---|---|---|
| `financial_core.currency_scale(p_currency text)` | `postgres` | `ubuntu` |
| `financial_core.f3_amount(p_value jsonb, p_currency text)` | `postgres` | `ubuntu` |
| `financial_core.f3_canonical(p_payload jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_correction_canonical(p jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_correction_child_id(g uuid, r uuid, role text)` | `postgres` | `ubuntu` |
| `financial_core.f3_correction_fingerprint(p jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_correction_posting_json(id uuid, event_id uuid, g uuid, epoch uuid, c text, occurred timestamp with time zone, amount numeric, control financial_control_class, account uuid, fund uuid, category uuid, cat_class financial_category_class, member uuid, project uuid)` | `postgres` | `ubuntu` |
| `financial_core.f3_correction_reason(p jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_correction_signed_amount(p numeric, c text)` | `postgres` | `ubuntu` |
| `financial_core.f3_correction_timestamp(p timestamp with time zone)` | `postgres` | `ubuntu` |
| `financial_core.f3_currency(p_value jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_fingerprint(p_payload jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_timestamp(p_value jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_trim(p_text text)` | `postgres` | `ubuntu` |
| `financial_core.f3_uuid(p_value jsonb, p_optional boolean)` | `postgres` | `ubuntu` |
| `financial_core.format_projection_amount(p_amount numeric, p_currency text)` | `postgres` | `ubuntu` |
| `financial_core.guard_f3_correction_payload()` | `postgres` | `ubuntu` |
| `financial_core.guard_f3_payload()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_account()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_category()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_event_history()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_fund()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_posting_history()` | `postgres` | `ubuntu` |
| `financial_core.lock_f3_identity(p_group uuid, p_request uuid, p_module text, p_source text, p_effect text)` | `postgres` | `ubuntu` |
| `financial_core.lock_financial_occurrence(p_group_id uuid, p_source_module text, p_source_record_id text, p_effect_kind text, p_ledger_epoch_id uuid)` | `postgres` | `ubuntu` |
| `financial_core.projection_cashbook_rows(p_group_id uuid, p_include_audit boolean)` | `postgres` | `ubuntu` |

### schema (expectedCount=2, observedCount=2, onlyInExpected=2, onlyInObserved=2)

| object | expected owner | observed owner |
|---|---|---|
| `financial_core` | `postgres` | `ubuntu` |
| `financial_private` | `postgres` | `ubuntu` |

### schemas (expectedCount=2, observedCount=2, onlyInExpected=2, onlyInObserved=2)

| object | expected owner | observed owner |
|---|---|---|
| `financial_core` | `postgres` | `ubuntu` |
| `financial_private` | `postgres` | `ubuntu` |

### types (expectedCount=17, observedCount=17, onlyInExpected=17, onlyInObserved=17)

| object | expected owner | observed owner |
|---|---|---|
| `financial_core.correction_command_payloads (composite)` | `postgres` | `ubuntu` |
| `financial_core.posting_command_payloads (composite)` | `postgres` | `ubuntu` |
| `financial_private.epoch_transitions (composite)` | `postgres` | `ubuntu` |
| `financial_private.internal_financial_tenants (composite)` | `postgres` | `ubuntu` |
| `public.financial_account_kind (enum)` | `postgres` | `ubuntu` |
| `public.financial_account_status (enum)` | `postgres` | `ubuntu` |
| `public.financial_accounts (composite)` | `postgres` | `ubuntu` |
| `public.financial_categories (composite)` | `postgres` | `ubuntu` |
| `public.financial_category_class (enum)` | `postgres` | `ubuntu` |
| `public.financial_config_status (enum)` | `postgres` | `ubuntu` |
| `public.financial_control_class (enum)` | `postgres` | `ubuntu` |
| `public.financial_event_class (enum)` | `postgres` | `ubuntu` |
| `public.financial_event_status (enum)` | `postgres` | `ubuntu` |
| `public.financial_events (composite)` | `postgres` | `ubuntu` |
| `public.financial_funds (composite)` | `postgres` | `ubuntu` |
| `public.financial_ledger_epochs (composite)` | `postgres` | `ubuntu` |
| `public.financial_postings (composite)` | `postgres` | `ubuntu` |

## 00123_f3_05_opening_cash_command.sql

| expectedSha256 | observedSha256 |
|---|---|
| `d5e50fd760a9629bf4e1574fd256ecf0d4a108df83dec27323a608e0466dcb34` | `ba24bf71766a73f1e6132c5e92fbd4b97631a0137b501c287bffa92887fffadd` |

### function_owner (expectedCount=50, observedCount=50, onlyInExpected=28, onlyInObserved=28)

| object | expected owner | observed owner |
|---|---|---|
| `financial_core.currency_scale(p_currency text)` | `postgres` | `ubuntu` |
| `financial_core.f3_amount(p_value jsonb, p_currency text)` | `postgres` | `ubuntu` |
| `financial_core.f3_canonical(p_payload jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_correction_canonical(p jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_correction_child_id(g uuid, r uuid, role text)` | `postgres` | `ubuntu` |
| `financial_core.f3_correction_fingerprint(p jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_correction_posting_json(id uuid, event_id uuid, g uuid, epoch uuid, c text, occurred timestamp with time zone, amount numeric, control financial_control_class, account uuid, fund uuid, category uuid, cat_class financial_category_class, member uuid, project uuid)` | `postgres` | `ubuntu` |
| `financial_core.f3_correction_reason(p jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_correction_signed_amount(p numeric, c text)` | `postgres` | `ubuntu` |
| `financial_core.f3_correction_timestamp(p timestamp with time zone)` | `postgres` | `ubuntu` |
| `financial_core.f3_currency(p_value jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_fingerprint(p_payload jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_opening_safe_text(p_value text, p_max integer, p_required boolean)` | `postgres` | `ubuntu` |
| `financial_core.f3_timestamp(p_value jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_trim(p_text text)` | `postgres` | `ubuntu` |
| `financial_core.f3_uuid(p_value jsonb, p_optional boolean)` | `postgres` | `ubuntu` |
| `financial_core.format_projection_amount(p_amount numeric, p_currency text)` | `postgres` | `ubuntu` |
| `financial_core.guard_f3_correction_payload()` | `postgres` | `ubuntu` |
| `financial_core.guard_f3_opening_provenance()` | `postgres` | `ubuntu` |
| `financial_core.guard_f3_payload()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_account()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_category()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_event_history()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_fund()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_posting_history()` | `postgres` | `ubuntu` |
| `financial_core.lock_f3_identity(p_group uuid, p_request uuid, p_module text, p_source text, p_effect text)` | `postgres` | `ubuntu` |
| `financial_core.lock_financial_occurrence(p_group_id uuid, p_source_module text, p_source_record_id text, p_effect_kind text, p_ledger_epoch_id uuid)` | `postgres` | `ubuntu` |
| `financial_core.projection_cashbook_rows(p_group_id uuid, p_include_audit boolean)` | `postgres` | `ubuntu` |

### relations (expectedCount=11, observedCount=11, onlyInExpected=11, onlyInObserved=11)

| object | expected owner | observed owner |
|---|---|---|
| `financial_core.correction_command_payloads` | `postgres` | `ubuntu` |
| `financial_core.opening_provenances` | `postgres` | `ubuntu` |
| `financial_core.posting_command_payloads` | `postgres` | `ubuntu` |
| `financial_private.epoch_transitions` | `postgres` | `ubuntu` |
| `financial_private.internal_financial_tenants` | `postgres` | `ubuntu` |
| `public.financial_accounts` | `postgres` | `ubuntu` |
| `public.financial_categories` | `postgres` | `ubuntu` |
| `public.financial_events` | `postgres` | `ubuntu` |
| `public.financial_funds` | `postgres` | `ubuntu` |
| `public.financial_ledger_epochs` | `postgres` | `ubuntu` |
| `public.financial_postings` | `postgres` | `ubuntu` |

### routines (expectedCount=50, observedCount=50, onlyInExpected=28, onlyInObserved=28)

| object | expected owner | observed owner |
|---|---|---|
| `financial_core.currency_scale(p_currency text)` | `postgres` | `ubuntu` |
| `financial_core.f3_amount(p_value jsonb, p_currency text)` | `postgres` | `ubuntu` |
| `financial_core.f3_canonical(p_payload jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_correction_canonical(p jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_correction_child_id(g uuid, r uuid, role text)` | `postgres` | `ubuntu` |
| `financial_core.f3_correction_fingerprint(p jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_correction_posting_json(id uuid, event_id uuid, g uuid, epoch uuid, c text, occurred timestamp with time zone, amount numeric, control financial_control_class, account uuid, fund uuid, category uuid, cat_class financial_category_class, member uuid, project uuid)` | `postgres` | `ubuntu` |
| `financial_core.f3_correction_reason(p jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_correction_signed_amount(p numeric, c text)` | `postgres` | `ubuntu` |
| `financial_core.f3_correction_timestamp(p timestamp with time zone)` | `postgres` | `ubuntu` |
| `financial_core.f3_currency(p_value jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_fingerprint(p_payload jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_opening_safe_text(p_value text, p_max integer, p_required boolean)` | `postgres` | `ubuntu` |
| `financial_core.f3_timestamp(p_value jsonb)` | `postgres` | `ubuntu` |
| `financial_core.f3_trim(p_text text)` | `postgres` | `ubuntu` |
| `financial_core.f3_uuid(p_value jsonb, p_optional boolean)` | `postgres` | `ubuntu` |
| `financial_core.format_projection_amount(p_amount numeric, p_currency text)` | `postgres` | `ubuntu` |
| `financial_core.guard_f3_correction_payload()` | `postgres` | `ubuntu` |
| `financial_core.guard_f3_opening_provenance()` | `postgres` | `ubuntu` |
| `financial_core.guard_f3_payload()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_account()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_category()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_event_history()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_fund()` | `postgres` | `ubuntu` |
| `financial_core.guard_financial_posting_history()` | `postgres` | `ubuntu` |
| `financial_core.lock_f3_identity(p_group uuid, p_request uuid, p_module text, p_source text, p_effect text)` | `postgres` | `ubuntu` |
| `financial_core.lock_financial_occurrence(p_group_id uuid, p_source_module text, p_source_record_id text, p_effect_kind text, p_ledger_epoch_id uuid)` | `postgres` | `ubuntu` |
| `financial_core.projection_cashbook_rows(p_group_id uuid, p_include_audit boolean)` | `postgres` | `ubuntu` |

### schema (expectedCount=2, observedCount=2, onlyInExpected=2, onlyInObserved=2)

| object | expected owner | observed owner |
|---|---|---|
| `financial_core` | `postgres` | `ubuntu` |
| `financial_private` | `postgres` | `ubuntu` |

### schemas (expectedCount=2, observedCount=2, onlyInExpected=2, onlyInObserved=2)

| object | expected owner | observed owner |
|---|---|---|
| `financial_core` | `postgres` | `ubuntu` |
| `financial_private` | `postgres` | `ubuntu` |

### types (expectedCount=18, observedCount=18, onlyInExpected=18, onlyInObserved=18)

| object | expected owner | observed owner |
|---|---|---|
| `financial_core.correction_command_payloads (composite)` | `postgres` | `ubuntu` |
| `financial_core.opening_provenances (composite)` | `postgres` | `ubuntu` |
| `financial_core.posting_command_payloads (composite)` | `postgres` | `ubuntu` |
| `financial_private.epoch_transitions (composite)` | `postgres` | `ubuntu` |
| `financial_private.internal_financial_tenants (composite)` | `postgres` | `ubuntu` |
| `public.financial_account_kind (enum)` | `postgres` | `ubuntu` |
| `public.financial_account_status (enum)` | `postgres` | `ubuntu` |
| `public.financial_accounts (composite)` | `postgres` | `ubuntu` |
| `public.financial_categories (composite)` | `postgres` | `ubuntu` |
| `public.financial_category_class (enum)` | `postgres` | `ubuntu` |
| `public.financial_config_status (enum)` | `postgres` | `ubuntu` |
| `public.financial_control_class (enum)` | `postgres` | `ubuntu` |
| `public.financial_event_class (enum)` | `postgres` | `ubuntu` |
| `public.financial_event_status (enum)` | `postgres` | `ubuntu` |
| `public.financial_events (composite)` | `postgres` | `ubuntu` |
| `public.financial_funds (composite)` | `postgres` | `ubuntu` |
| `public.financial_ledger_epochs (composite)` | `postgres` | `ubuntu` |
| `public.financial_postings (composite)` | `postgres` | `ubuntu` |

