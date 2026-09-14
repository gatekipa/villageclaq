/**
 * Repair-safety gate for the db-push qualification sequence.
 *
 * Repair may spawn ONLY after every required proof is true. Any miss,
 * malformed value, ambiguity, or exception → poison cleanup only (when
 * safe); no repair; no next migration; no continuation.
 *
 * Object presence is accepted only by strict structured JSON probe parse.
 * Fingerprints require expected+observed complete-schema canonical equality.
 * Poison must be proven absent by a separate post-cleanup probe before repair.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  APPROVED_DISPOSABLE_HOST,
  APPROVED_DISPOSABLE_ORG_ID,
  APPROVED_DISPOSABLE_PROJECT_NAME,
  APPROVED_DISPOSABLE_PROJECT_REF,
  CLI_PIN,
  F3_FORWARD_FILES,
  FROZEN_DIGESTS,
  HISTORY_INJECT_MARKER,
  PREASSIGNED_VERSIONS,
  PRODUCTION_REF,
  RECOGNITION_ALLOWLIST,
  TARGET_OBJECT_PROBES,
} from "./f3-db-push-pins.mjs";
import { timestampFilenameFor } from "./f3-db-push-version-map.mjs";
import { extractPsqlErrorLines } from "./f3-db-push-stub-live-pin-floor.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

export const REPAIR_SAFETY_HOLD =
  "HOLD: repair-safety gate failed; poison cleaned; repair not spawned; no continuation";

export const FINGERPRINT_REQUIRED_KEYS = Object.freeze([
  "schema",
  "function_owner",
  "acl",
  "policy",
]);

/** Catalog fields that, if present on either side, must exist on both and match exactly. */
export const FINGERPRINT_OPTIONAL_CATALOG_KEYS = Object.freeze([
  "rls",
  "owner",
  "function_definition",
  "search_path",
  "hgp_pin",
  "hgp",
  "enqueue",
  "object_identity",
  "f3_objects_absent",
]);

export const FINGERPRINT_CATALOG_KEYS = Object.freeze([
  ...FINGERPRINT_REQUIRED_KEYS,
  ...FINGERPRINT_OPTIONAL_CATALOG_KEYS,
  "recognition",
]);

export const FINGERPRINT_META_KEYS = Object.freeze([
  "migration_file",
  "migration_version",
  "migration_name",
  "migration_digest",
  "recognition",
]);

export const FINGERPRINT_ALLOWED_KEYS = Object.freeze([
  ...new Set([...FINGERPRINT_REQUIRED_KEYS, ...FINGERPRINT_CATALOG_KEYS, ...FINGERPRINT_META_KEYS]),
]);

/** Schema is a comma-separated inventory with no internal commas. ACL/policy/owner are not set-like. */
export const FINGERPRINT_SET_LIKE_STRING_KEYS = Object.freeze(["schema"]);

function deepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
  } else {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return Object.freeze(value);
}

/* AUTO-EMBEDDED from docs/evidence/M3_F3_FROZEN_EXPECTED_FINGERPRINTS_20260914.json
 * Offline construction seal. Not read from DB. Do not assign from observed.
 */
const FROZEN_EXPECTED_FINGERPRINTS_RAW = {
  "00118_f3_bounded_financial_epoch_foundation.sql": {
    "acl": "financial_private.epoch_transitions:{postgres=arwdDxtm/postgres},financial_private.guard_ledger_epoch():{postgres=X/postgres},financial_private.internal_financial_tenants:{postgres=arwdDxtm/postgres},public.financial_ledger_epochs:{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres}",
    "policy": "public.financial_ledger_epochs.financial_ledger_epoch_active_reader:SELECT:{authenticated}:(EXISTS ( SELECT 1\n   FROM memberships m\n  WHERE ((m.group_id = financial_ledger_epochs.group_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text)))):",
    "schema": "financial_private:postgres",
    "function_owner": "financial_private.guard_ledger_epoch():postgres:true:{\"search_path=\\\"\\\"\"}",
    "f3_objects_absent": false,
    "migration_file": "00118_f3_bounded_financial_epoch_foundation.sql",
    "migration_version": "20260913173000",
    "migration_name": "00118_f3_bounded_financial_epoch_foundation",
    "migration_digest": "bb823ebdddcefba7774f3347a609a05393d9a67c9430d0bd925c3458eaf5efed",
    "recognition": [
      "manual_income"
    ]
  },
  "00119_f3_01_core_ledger_foundation.sql": {
    "acl": "financial_core.assert_finances_manage(p_group_id uuid):{postgres=X/postgres,authenticated=X/postgres},financial_core.assert_financial_event_balanced(p_event_id uuid):{postgres=X/postgres},financial_core.can_manage_finances(p_group_id uuid):{postgres=X/postgres,authenticated=X/postgres},financial_core.can_view_finances(p_group_id uuid):{postgres=X/postgres,authenticated=X/postgres},financial_core.check_event_balance_from_event():{postgres=X/postgres},financial_core.check_event_balance_from_posting():{postgres=X/postgres},financial_core.currency_scale(p_currency text):{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres},financial_core.guard_financial_account():{postgres=X/postgres},financial_core.guard_financial_category():{postgres=X/postgres},financial_core.guard_financial_event_epoch():{postgres=X/postgres},financial_core.guard_financial_event_history():{postgres=X/postgres},financial_core.guard_financial_fund():{postgres=X/postgres},financial_core.guard_financial_posting_history():{postgres=X/postgres},financial_core.lock_financial_occurrence(p_group_id uuid, p_source_module text, p_source_record_id text, p_effect_kind text, p_ledger_epoch_id uuid):{postgres=X/postgres},financial_private.epoch_transitions:{postgres=arwdDxtm/postgres},financial_private.guard_ledger_epoch():{postgres=X/postgres},financial_private.internal_financial_tenants:{postgres=arwdDxtm/postgres},public.financial_accounts:{postgres=arwdDxtm/postgres,authenticated=arw/postgres,service_role=r/postgres},public.financial_categories:{postgres=arwdDxtm/postgres,authenticated=arw/postgres,service_role=r/postgres},public.financial_events:{postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=r/postgres},public.financial_funds:{postgres=arwdDxtm/postgres,authenticated=arw/postgres,service_role=r/postgres},public.financial_ledger_epochs:{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres},public.financial_postings:{postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=r/postgres}",
    "policy": "public.financial_ledger_epochs.financial_ledger_epoch_active_reader:SELECT:{authenticated}:(EXISTS ( SELECT 1\n   FROM memberships m\n  WHERE ((m.group_id = financial_ledger_epochs.group_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text)))):,public.financial_accounts.financial_accounts_manager_select:SELECT:{authenticated}:( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances):,public.financial_accounts.financial_accounts_manager_insert:INSERT:{authenticated}::( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances),public.financial_accounts.financial_accounts_manager_update:UPDATE:{authenticated}:( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances):( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances),public.financial_funds.financial_funds_manager_select:SELECT:{authenticated}:( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances):,public.financial_funds.financial_funds_manager_insert:INSERT:{authenticated}::( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances),public.financial_funds.financial_funds_manager_update:UPDATE:{authenticated}:( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances):( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances),public.financial_categories.financial_categories_manager_select:SELECT:{authenticated}:( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances):,public.financial_categories.financial_categories_manager_insert:INSERT:{authenticated}::(( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances) AND (NOT is_system)),public.financial_categories.financial_categories_manager_update:UPDATE:{authenticated}:(( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances) AND (NOT is_system)):(( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances) AND (NOT is_system)),public.financial_events.financial_events_finance_reader:SELECT:{authenticated}:( SELECT financial_core.can_view_finances(financial_events.group_id) AS can_view_finances):,public.financial_postings.financial_postings_finance_reader:SELECT:{authenticated}:( SELECT financial_core.can_view_finances(financial_postings.group_id) AS can_view_finances):",
    "schema": "financial_core:postgres,financial_private:postgres",
    "function_owner": "financial_private.guard_ledger_epoch():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_posting_history():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.check_event_balance_from_event():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_account():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_fund():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_category():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_event_epoch():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_event_history():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.assert_financial_event_balanced(p_event_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.check_event_balance_from_posting():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.lock_financial_occurrence(p_group_id uuid, p_source_module text, p_source_record_id text, p_effect_kind text, p_ledger_epoch_id uuid):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.currency_scale(p_currency text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.can_manage_finances(p_group_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.can_view_finances(p_group_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.assert_finances_manage(p_group_id uuid):postgres:true:{\"search_path=\\\"\\\"\"}",
    "f3_objects_absent": false,
    "migration_file": "00119_f3_01_core_ledger_foundation.sql",
    "migration_version": "20260913173001",
    "migration_name": "00119_f3_01_core_ledger_foundation",
    "migration_digest": "b22e16783fbb429ccae0ce15291d83311861f4e873cd01363bbd630372633f11",
    "recognition": [
      "manual_income"
    ]
  },
  "00120_f3_02_secure_posting_idempotency.sql": {
    "acl": "financial_core.assert_finances_manage(p_group_id uuid):{postgres=X/postgres,authenticated=X/postgres},financial_core.assert_financial_event_balanced(p_event_id uuid):{postgres=X/postgres},financial_core.can_manage_finances(p_group_id uuid):{postgres=X/postgres,authenticated=X/postgres},financial_core.can_view_finances(p_group_id uuid):{postgres=X/postgres,authenticated=X/postgres},financial_core.check_event_balance_from_event():{postgres=X/postgres},financial_core.check_event_balance_from_posting():{postgres=X/postgres},financial_core.check_f3_posting_closure():{postgres=X/postgres},financial_core.currency_scale(p_currency text):{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres},financial_core.f3_amount(p_value jsonb, p_currency text):{postgres=X/postgres},financial_core.f3_canonical(p_payload jsonb):{postgres=X/postgres},financial_core.f3_currency(p_value jsonb):{postgres=X/postgres},financial_core.f3_fingerprint(p_payload jsonb):{postgres=X/postgres},financial_core.f3_timestamp(p_value jsonb):{postgres=X/postgres},financial_core.f3_trim(p_text text):{postgres=X/postgres},financial_core.f3_uuid(p_value jsonb, p_optional boolean):{postgres=X/postgres},financial_core.guard_f3_payload():{postgres=X/postgres},financial_core.guard_f3_posting_closure():{postgres=X/postgres},financial_core.guard_financial_account():{postgres=X/postgres},financial_core.guard_financial_category():{postgres=X/postgres},financial_core.guard_financial_event_epoch():{postgres=X/postgres},financial_core.guard_financial_event_history():{postgres=X/postgres},financial_core.guard_financial_fund():{postgres=X/postgres},financial_core.guard_financial_posting_history():{postgres=X/postgres},financial_core.lock_f3_identity(p_group uuid, p_request uuid, p_module text, p_source text, p_effect text):{postgres=X/postgres},financial_core.lock_financial_occurrence(p_group_id uuid, p_source_module text, p_source_record_id text, p_effect_kind text, p_ledger_epoch_id uuid):{postgres=X/postgres},financial_core.post_f3_command(p_command jsonb, p_opening jsonb):{postgres=X/postgres},financial_core.posting_command_payloads:{postgres=arwdDxtm/postgres},financial_private.epoch_transitions:{postgres=arwdDxtm/postgres},financial_private.guard_ledger_epoch():{postgres=X/postgres},financial_private.internal_financial_tenants:{postgres=arwdDxtm/postgres},public.financial_accounts:{postgres=arwdDxtm/postgres,authenticated=arw/postgres,service_role=r/postgres},public.financial_categories:{postgres=arwdDxtm/postgres,authenticated=arw/postgres,service_role=r/postgres},public.financial_events:{postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=r/postgres},public.financial_funds:{postgres=arwdDxtm/postgres,authenticated=arw/postgres,service_role=r/postgres},public.financial_ledger_epochs:{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres},public.financial_postings:{postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=r/postgres},public.post_financial_command(p_command jsonb):{postgres=X/postgres,authenticated=X/postgres}",
    "policy": "public.financial_ledger_epochs.financial_ledger_epoch_active_reader:SELECT:{authenticated}:(EXISTS ( SELECT 1\n   FROM memberships m\n  WHERE ((m.group_id = financial_ledger_epochs.group_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text)))):,public.financial_accounts.financial_accounts_manager_select:SELECT:{authenticated}:( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances):,public.financial_accounts.financial_accounts_manager_insert:INSERT:{authenticated}::( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances),public.financial_accounts.financial_accounts_manager_update:UPDATE:{authenticated}:( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances):( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances),public.financial_funds.financial_funds_manager_select:SELECT:{authenticated}:( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances):,public.financial_funds.financial_funds_manager_insert:INSERT:{authenticated}::( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances),public.financial_funds.financial_funds_manager_update:UPDATE:{authenticated}:( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances):( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances),public.financial_categories.financial_categories_manager_select:SELECT:{authenticated}:( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances):,public.financial_categories.financial_categories_manager_insert:INSERT:{authenticated}::(( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances) AND (NOT is_system)),public.financial_categories.financial_categories_manager_update:UPDATE:{authenticated}:(( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances) AND (NOT is_system)):(( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances) AND (NOT is_system)),public.financial_events.financial_events_finance_reader:SELECT:{authenticated}:( SELECT financial_core.can_view_finances(financial_events.group_id) AS can_view_finances):,public.financial_postings.financial_postings_finance_reader:SELECT:{authenticated}:( SELECT financial_core.can_view_finances(financial_postings.group_id) AS can_view_finances):",
    "schema": "financial_core:postgres,financial_private:postgres",
    "function_owner": "financial_private.guard_ledger_epoch():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_posting_history():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.check_event_balance_from_event():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_account():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_fund():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_category():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_event_epoch():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_event_history():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.assert_financial_event_balanced(p_event_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.check_event_balance_from_posting():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.lock_financial_occurrence(p_group_id uuid, p_source_module text, p_source_record_id text, p_effect_kind text, p_ledger_epoch_id uuid):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.currency_scale(p_currency text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.can_manage_finances(p_group_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.can_view_finances(p_group_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.assert_finances_manage(p_group_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.f3_uuid(p_value jsonb, p_optional boolean):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_currency(p_value jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_f3_payload():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_amount(p_value jsonb, p_currency text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_timestamp(p_value jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_trim(p_text text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_canonical(p_payload jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_fingerprint(p_payload jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_f3_posting_closure():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.check_f3_posting_closure():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.lock_f3_identity(p_group uuid, p_request uuid, p_module text, p_source text, p_effect text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.post_f3_command(p_command jsonb, p_opening jsonb):postgres:true:{\"search_path=\\\"\\\"\"},public.post_financial_command(p_command jsonb):postgres:true:{\"search_path=\\\"\\\"\"}",
    "f3_objects_absent": false,
    "migration_file": "00120_f3_02_secure_posting_idempotency.sql",
    "migration_version": "20260913173002",
    "migration_name": "00120_f3_02_secure_posting_idempotency",
    "migration_digest": "d81c8f52d4fccea4b654c3a54806ffc07d654ffa2a33540c97b74721d56b9a60",
    "recognition": [
      "manual_income"
    ]
  },
  "00121_f3_03_projection_read_proof.sql": {
    "acl": "financial_core.assert_finances_manage(p_group_id uuid):{postgres=X/postgres,authenticated=X/postgres},financial_core.assert_financial_event_balanced(p_event_id uuid):{postgres=X/postgres},financial_core.can_manage_finances(p_group_id uuid):{postgres=X/postgres,authenticated=X/postgres},financial_core.can_view_finances(p_group_id uuid):{postgres=X/postgres,authenticated=X/postgres},financial_core.check_event_balance_from_event():{postgres=X/postgres},financial_core.check_event_balance_from_posting():{postgres=X/postgres},financial_core.check_f3_posting_closure():{postgres=X/postgres},financial_core.currency_scale(p_currency text):{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres},financial_core.f3_amount(p_value jsonb, p_currency text):{postgres=X/postgres},financial_core.f3_canonical(p_payload jsonb):{postgres=X/postgres},financial_core.f3_currency(p_value jsonb):{postgres=X/postgres},financial_core.f3_fingerprint(p_payload jsonb):{postgres=X/postgres},financial_core.f3_timestamp(p_value jsonb):{postgres=X/postgres},financial_core.f3_trim(p_text text):{postgres=X/postgres},financial_core.f3_uuid(p_value jsonb, p_optional boolean):{postgres=X/postgres},financial_core.format_projection_amount(p_amount numeric, p_currency text):{postgres=X/postgres},financial_core.guard_f3_payload():{postgres=X/postgres},financial_core.guard_f3_posting_closure():{postgres=X/postgres},financial_core.guard_financial_account():{postgres=X/postgres},financial_core.guard_financial_category():{postgres=X/postgres},financial_core.guard_financial_event_epoch():{postgres=X/postgres},financial_core.guard_financial_event_history():{postgres=X/postgres},financial_core.guard_financial_fund():{postgres=X/postgres},financial_core.guard_financial_posting_history():{postgres=X/postgres},financial_core.lock_f3_identity(p_group uuid, p_request uuid, p_module text, p_source text, p_effect text):{postgres=X/postgres},financial_core.lock_financial_occurrence(p_group_id uuid, p_source_module text, p_source_record_id text, p_effect_kind text, p_ledger_epoch_id uuid):{postgres=X/postgres},financial_core.post_f3_command(p_command jsonb, p_opening jsonb):{postgres=X/postgres},financial_core.posting_command_payloads:{postgres=arwdDxtm/postgres},financial_core.projection_cashbook_rows(p_group_id uuid, p_include_audit boolean):{postgres=X/postgres},financial_private.epoch_transitions:{postgres=arwdDxtm/postgres},financial_private.guard_ledger_epoch():{postgres=X/postgres},financial_private.internal_financial_tenants:{postgres=arwdDxtm/postgres},public.financial_accounts:{postgres=arwdDxtm/postgres,authenticated=arw/postgres,service_role=r/postgres},public.financial_categories:{postgres=arwdDxtm/postgres,authenticated=arw/postgres,service_role=r/postgres},public.financial_events:{postgres=arwdDxtm/postgres,service_role=r/postgres},public.financial_funds:{postgres=arwdDxtm/postgres,authenticated=arw/postgres,service_role=r/postgres},public.financial_ledger_epochs:{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres},public.financial_postings:{postgres=arwdDxtm/postgres,service_role=r/postgres},public.get_financial_cashbook(p_group_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_account_id uuid, p_currency text, p_offset integer, p_limit integer):{postgres=X/postgres,authenticated=X/postgres},public.get_financial_projection_bundle(p_group_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_as_of_exclusive timestamp with time zone):{postgres=X/postgres,authenticated=X/postgres},public.post_financial_command(p_command jsonb):{postgres=X/postgres,authenticated=X/postgres}",
    "policy": "public.financial_ledger_epochs.financial_ledger_epoch_active_reader:SELECT:{authenticated}:(EXISTS ( SELECT 1\n   FROM memberships m\n  WHERE ((m.group_id = financial_ledger_epochs.group_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text)))):,public.financial_accounts.financial_accounts_manager_select:SELECT:{authenticated}:( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances):,public.financial_accounts.financial_accounts_manager_insert:INSERT:{authenticated}::( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances),public.financial_accounts.financial_accounts_manager_update:UPDATE:{authenticated}:( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances):( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances),public.financial_funds.financial_funds_manager_select:SELECT:{authenticated}:( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances):,public.financial_funds.financial_funds_manager_insert:INSERT:{authenticated}::( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances),public.financial_funds.financial_funds_manager_update:UPDATE:{authenticated}:( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances):( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances),public.financial_categories.financial_categories_manager_select:SELECT:{authenticated}:( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances):,public.financial_categories.financial_categories_manager_insert:INSERT:{authenticated}::(( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances) AND (NOT is_system)),public.financial_categories.financial_categories_manager_update:UPDATE:{authenticated}:(( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances) AND (NOT is_system)):(( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances) AND (NOT is_system)),public.financial_events.financial_events_finance_reader:SELECT:{authenticated}:( SELECT financial_core.can_view_finances(financial_events.group_id) AS can_view_finances):,public.financial_postings.financial_postings_finance_reader:SELECT:{authenticated}:( SELECT financial_core.can_view_finances(financial_postings.group_id) AS can_view_finances):",
    "schema": "financial_core:postgres,financial_private:postgres",
    "function_owner": "financial_core.format_projection_amount(p_amount numeric, p_currency text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.projection_cashbook_rows(p_group_id uuid, p_include_audit boolean):postgres:false:{\"search_path=\\\"\\\"\"},public.get_financial_projection_bundle(p_group_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_as_of_exclusive timestamp with time zone):postgres:true:{\"search_path=\\\"\\\"\"},public.get_financial_cashbook(p_group_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_account_id uuid, p_currency text, p_offset integer, p_limit integer):postgres:true:{\"search_path=\\\"\\\"\"},financial_private.guard_ledger_epoch():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_posting_history():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.check_event_balance_from_event():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_account():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_fund():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_category():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_event_epoch():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_event_history():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.assert_financial_event_balanced(p_event_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.check_event_balance_from_posting():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.lock_financial_occurrence(p_group_id uuid, p_source_module text, p_source_record_id text, p_effect_kind text, p_ledger_epoch_id uuid):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.currency_scale(p_currency text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.can_manage_finances(p_group_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.can_view_finances(p_group_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.assert_finances_manage(p_group_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.f3_uuid(p_value jsonb, p_optional boolean):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_currency(p_value jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_f3_payload():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_amount(p_value jsonb, p_currency text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_timestamp(p_value jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_trim(p_text text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_canonical(p_payload jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_fingerprint(p_payload jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_f3_posting_closure():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.check_f3_posting_closure():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.lock_f3_identity(p_group uuid, p_request uuid, p_module text, p_source text, p_effect text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.post_f3_command(p_command jsonb, p_opening jsonb):postgres:true:{\"search_path=\\\"\\\"\"},public.post_financial_command(p_command jsonb):postgres:true:{\"search_path=\\\"\\\"\"}",
    "f3_objects_absent": false,
    "migration_file": "00121_f3_03_projection_read_proof.sql",
    "migration_version": "20260913173003",
    "migration_name": "00121_f3_03_projection_read_proof",
    "migration_digest": "51f40ccbd7dad79362b8cf2cd9854b9c8cdfd7295e4c10be5892d953915e90ce",
    "recognition": [
      "manual_income"
    ]
  },
  "00122_f3_04_correction_reversal.sql": {
    "acl": "financial_core.assert_f3_correction_postings(event uuid, expected jsonb):{postgres=X/postgres},financial_core.assert_finances_manage(p_group_id uuid):{postgres=X/postgres,authenticated=X/postgres},financial_core.assert_financial_event_balanced(p_event_id uuid):{postgres=X/postgres},financial_core.can_manage_finances(p_group_id uuid):{postgres=X/postgres,authenticated=X/postgres},financial_core.can_view_finances(p_group_id uuid):{postgres=X/postgres,authenticated=X/postgres},financial_core.check_event_balance_from_event():{postgres=X/postgres},financial_core.check_event_balance_from_posting():{postgres=X/postgres},financial_core.check_f3_correction_closure():{postgres=X/postgres},financial_core.check_f3_posting_closure():{postgres=X/postgres},financial_core.correct_f3_command(cmd jsonb):{postgres=X/postgres},financial_core.correction_command_payloads:{postgres=arwdDxtm/postgres},financial_core.currency_scale(p_currency text):{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres},financial_core.f3_amount(p_value jsonb, p_currency text):{postgres=X/postgres},financial_core.f3_canonical(p_payload jsonb):{postgres=X/postgres},financial_core.f3_correction_canonical(p jsonb):{postgres=X/postgres},financial_core.f3_correction_child_id(g uuid, r uuid, role text):{postgres=X/postgres},financial_core.f3_correction_fingerprint(p jsonb):{postgres=X/postgres},financial_core.f3_correction_posting_json(id uuid, event_id uuid, g uuid, epoch uuid, c text, occurred timestamp with time zone, amount numeric, control financial_control_class, account uuid, fund uuid, category uuid, cat_class financial_category_class, member uuid, project uuid):{postgres=X/postgres},financial_core.f3_correction_reason(p jsonb):{postgres=X/postgres},financial_core.f3_correction_signed_amount(p numeric, c text):{postgres=X/postgres},financial_core.f3_correction_timestamp(p timestamp with time zone):{postgres=X/postgres},financial_core.f3_currency(p_value jsonb):{postgres=X/postgres},financial_core.f3_fingerprint(p_payload jsonb):{postgres=X/postgres},financial_core.f3_timestamp(p_value jsonb):{postgres=X/postgres},financial_core.f3_trim(p_text text):{postgres=X/postgres},financial_core.f3_uuid(p_value jsonb, p_optional boolean):{postgres=X/postgres},financial_core.format_projection_amount(p_amount numeric, p_currency text):{postgres=X/postgres},financial_core.guard_f3_correction_lineage():{postgres=X/postgres},financial_core.guard_f3_correction_payload():{postgres=X/postgres},financial_core.guard_f3_payload():{postgres=X/postgres},financial_core.guard_f3_posting_closure():{postgres=X/postgres},financial_core.guard_financial_account():{postgres=X/postgres},financial_core.guard_financial_category():{postgres=X/postgres},financial_core.guard_financial_event_epoch():{postgres=X/postgres},financial_core.guard_financial_event_history():{postgres=X/postgres},financial_core.guard_financial_fund():{postgres=X/postgres},financial_core.guard_financial_posting_history():{postgres=X/postgres},financial_core.lock_f3_identity(p_group uuid, p_request uuid, p_module text, p_source text, p_effect text):{postgres=X/postgres},financial_core.lock_financial_occurrence(p_group_id uuid, p_source_module text, p_source_record_id text, p_effect_kind text, p_ledger_epoch_id uuid):{postgres=X/postgres},financial_core.post_f3_command(p_command jsonb, p_opening jsonb):{postgres=X/postgres},financial_core.posting_command_payloads:{postgres=arwdDxtm/postgres},financial_core.projection_cashbook_rows(p_group_id uuid, p_include_audit boolean):{postgres=X/postgres},financial_core.resolve_f3_correction_replacement(d jsonb, target jsonb, replay boolean):{postgres=X/postgres},financial_private.epoch_transitions:{postgres=arwdDxtm/postgres},financial_private.guard_ledger_epoch():{postgres=X/postgres},financial_private.internal_financial_tenants:{postgres=arwdDxtm/postgres},public.correct_financial_event(p_command jsonb):{postgres=X/postgres,authenticated=X/postgres},public.financial_accounts:{postgres=arwdDxtm/postgres,authenticated=arw/postgres,service_role=r/postgres},public.financial_categories:{postgres=arwdDxtm/postgres,authenticated=arw/postgres,service_role=r/postgres},public.financial_events:{postgres=arwdDxtm/postgres,service_role=r/postgres},public.financial_funds:{postgres=arwdDxtm/postgres,authenticated=arw/postgres,service_role=r/postgres},public.financial_ledger_epochs:{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres},public.financial_postings:{postgres=arwdDxtm/postgres,service_role=r/postgres},public.get_financial_cashbook(p_group_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_account_id uuid, p_currency text, p_offset integer, p_limit integer):{postgres=X/postgres,authenticated=X/postgres},public.get_financial_projection_bundle(p_group_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_as_of_exclusive timestamp with time zone):{postgres=X/postgres,authenticated=X/postgres},public.post_financial_command(p_command jsonb):{postgres=X/postgres,authenticated=X/postgres}",
    "policy": "public.financial_ledger_epochs.financial_ledger_epoch_active_reader:SELECT:{authenticated}:(EXISTS ( SELECT 1\n   FROM memberships m\n  WHERE ((m.group_id = financial_ledger_epochs.group_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text)))):,public.financial_accounts.financial_accounts_manager_select:SELECT:{authenticated}:( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances):,public.financial_accounts.financial_accounts_manager_insert:INSERT:{authenticated}::( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances),public.financial_accounts.financial_accounts_manager_update:UPDATE:{authenticated}:( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances):( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances),public.financial_funds.financial_funds_manager_select:SELECT:{authenticated}:( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances):,public.financial_funds.financial_funds_manager_insert:INSERT:{authenticated}::( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances),public.financial_funds.financial_funds_manager_update:UPDATE:{authenticated}:( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances):( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances),public.financial_categories.financial_categories_manager_select:SELECT:{authenticated}:( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances):,public.financial_categories.financial_categories_manager_insert:INSERT:{authenticated}::(( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances) AND (NOT is_system)),public.financial_categories.financial_categories_manager_update:UPDATE:{authenticated}:(( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances) AND (NOT is_system)):(( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances) AND (NOT is_system)),public.financial_events.financial_events_finance_reader:SELECT:{authenticated}:( SELECT financial_core.can_view_finances(financial_events.group_id) AS can_view_finances):,public.financial_postings.financial_postings_finance_reader:SELECT:{authenticated}:( SELECT financial_core.can_view_finances(financial_postings.group_id) AS can_view_finances):",
    "schema": "financial_core:postgres,financial_private:postgres",
    "function_owner": "financial_core.format_projection_amount(p_amount numeric, p_currency text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.projection_cashbook_rows(p_group_id uuid, p_include_audit boolean):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_f3_correction_payload():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_f3_posting_closure():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.f3_correction_reason(p jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_correction_canonical(p jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_correction_fingerprint(p jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_correction_timestamp(p timestamp with time zone):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_correction_signed_amount(p numeric, c text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_correction_child_id(g uuid, r uuid, role text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_correction_posting_json(id uuid, event_id uuid, g uuid, epoch uuid, c text, occurred timestamp with time zone, amount numeric, control financial_control_class, account uuid, fund uuid, category uuid, cat_class financial_category_class, member uuid, project uuid):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.resolve_f3_correction_replacement(d jsonb, target jsonb, replay boolean):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.assert_f3_correction_postings(event uuid, expected jsonb):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_f3_correction_lineage():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.check_f3_correction_closure():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.correct_f3_command(cmd jsonb):postgres:true:{\"search_path=\\\"\\\"\"},public.correct_financial_event(p_command jsonb):postgres:true:{\"search_path=\\\"\\\"\"},public.get_financial_projection_bundle(p_group_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_as_of_exclusive timestamp with time zone):postgres:true:{\"search_path=\\\"\\\"\"},public.get_financial_cashbook(p_group_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_account_id uuid, p_currency text, p_offset integer, p_limit integer):postgres:true:{\"search_path=\\\"\\\"\"},financial_private.guard_ledger_epoch():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_posting_history():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.check_event_balance_from_event():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_account():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_fund():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_category():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_event_epoch():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_event_history():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.assert_financial_event_balanced(p_event_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.check_event_balance_from_posting():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.lock_financial_occurrence(p_group_id uuid, p_source_module text, p_source_record_id text, p_effect_kind text, p_ledger_epoch_id uuid):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.currency_scale(p_currency text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.can_manage_finances(p_group_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.can_view_finances(p_group_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.assert_finances_manage(p_group_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.f3_uuid(p_value jsonb, p_optional boolean):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_currency(p_value jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_f3_payload():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_amount(p_value jsonb, p_currency text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_timestamp(p_value jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_trim(p_text text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_canonical(p_payload jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_fingerprint(p_payload jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.check_f3_posting_closure():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.lock_f3_identity(p_group uuid, p_request uuid, p_module text, p_source text, p_effect text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.post_f3_command(p_command jsonb, p_opening jsonb):postgres:true:{\"search_path=\\\"\\\"\"},public.post_financial_command(p_command jsonb):postgres:true:{\"search_path=\\\"\\\"\"}",
    "f3_objects_absent": false,
    "migration_file": "00122_f3_04_correction_reversal.sql",
    "migration_version": "20260913173004",
    "migration_name": "00122_f3_04_correction_reversal",
    "migration_digest": "84f52b89b764a468db7748e5c572f2543c5d466e5369ff36e6889d85ca8434f3",
    "recognition": [
      "manual_income"
    ]
  },
  "00123_f3_05_opening_cash_command.sql": {
    "acl": "financial_core.assert_f3_correction_postings(event uuid, expected jsonb):{postgres=X/postgres},financial_core.assert_finances_manage(p_group_id uuid):{postgres=X/postgres,authenticated=X/postgres},financial_core.assert_financial_event_balanced(p_event_id uuid):{postgres=X/postgres},financial_core.can_manage_finances(p_group_id uuid):{postgres=X/postgres,authenticated=X/postgres},financial_core.can_view_finances(p_group_id uuid):{postgres=X/postgres,authenticated=X/postgres},financial_core.check_event_balance_from_event():{postgres=X/postgres},financial_core.check_event_balance_from_posting():{postgres=X/postgres},financial_core.check_f3_correction_closure():{postgres=X/postgres},financial_core.check_f3_posting_closure():{postgres=X/postgres},financial_core.correct_f3_command(cmd jsonb):{postgres=X/postgres},financial_core.correction_command_payloads:{postgres=arwdDxtm/postgres},financial_core.currency_scale(p_currency text):{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres},financial_core.f3_amount(p_value jsonb, p_currency text):{postgres=X/postgres},financial_core.f3_canonical(p_payload jsonb):{postgres=X/postgres},financial_core.f3_correction_canonical(p jsonb):{postgres=X/postgres},financial_core.f3_correction_child_id(g uuid, r uuid, role text):{postgres=X/postgres},financial_core.f3_correction_fingerprint(p jsonb):{postgres=X/postgres},financial_core.f3_correction_posting_json(id uuid, event_id uuid, g uuid, epoch uuid, c text, occurred timestamp with time zone, amount numeric, control financial_control_class, account uuid, fund uuid, category uuid, cat_class financial_category_class, member uuid, project uuid):{postgres=X/postgres},financial_core.f3_correction_reason(p jsonb):{postgres=X/postgres},financial_core.f3_correction_signed_amount(p numeric, c text):{postgres=X/postgres},financial_core.f3_correction_timestamp(p timestamp with time zone):{postgres=X/postgres},financial_core.f3_currency(p_value jsonb):{postgres=X/postgres},financial_core.f3_fingerprint(p_payload jsonb):{postgres=X/postgres},financial_core.f3_opening_safe_text(p_value text, p_max integer, p_required boolean):{postgres=X/postgres},financial_core.f3_timestamp(p_value jsonb):{postgres=X/postgres},financial_core.f3_trim(p_text text):{postgres=X/postgres},financial_core.f3_uuid(p_value jsonb, p_optional boolean):{postgres=X/postgres},financial_core.format_projection_amount(p_amount numeric, p_currency text):{postgres=X/postgres},financial_core.guard_f3_correction_lineage():{postgres=X/postgres},financial_core.guard_f3_correction_payload():{postgres=X/postgres},financial_core.guard_f3_opening_provenance():{postgres=X/postgres},financial_core.guard_f3_payload():{postgres=X/postgres},financial_core.guard_f3_posting_closure():{postgres=X/postgres},financial_core.guard_financial_account():{postgres=X/postgres},financial_core.guard_financial_category():{postgres=X/postgres},financial_core.guard_financial_event_epoch():{postgres=X/postgres},financial_core.guard_financial_event_history():{postgres=X/postgres},financial_core.guard_financial_fund():{postgres=X/postgres},financial_core.guard_financial_posting_history():{postgres=X/postgres},financial_core.lock_f3_identity(p_group uuid, p_request uuid, p_module text, p_source text, p_effect text):{postgres=X/postgres},financial_core.lock_financial_occurrence(p_group_id uuid, p_source_module text, p_source_record_id text, p_effect_kind text, p_ledger_epoch_id uuid):{postgres=X/postgres},financial_core.opening_provenances:{postgres=arwdDxtm/postgres},financial_core.post_f3_command(p_command jsonb, p_opening jsonb):{postgres=X/postgres},financial_core.post_f3_opening_cash(p_command jsonb):{postgres=X/postgres},financial_core.posting_command_payloads:{postgres=arwdDxtm/postgres},financial_core.projection_cashbook_rows(p_group_id uuid, p_include_audit boolean):{postgres=X/postgres},financial_core.resolve_f3_correction_replacement(d jsonb, target jsonb, replay boolean):{postgres=X/postgres},financial_private.epoch_transitions:{postgres=arwdDxtm/postgres},financial_private.guard_ledger_epoch():{postgres=X/postgres},financial_private.internal_financial_tenants:{postgres=arwdDxtm/postgres},public.correct_financial_event(p_command jsonb):{postgres=X/postgres,authenticated=X/postgres},public.financial_accounts:{postgres=arwdDxtm/postgres,authenticated=arw/postgres,service_role=r/postgres},public.financial_categories:{postgres=arwdDxtm/postgres,authenticated=arw/postgres,service_role=r/postgres},public.financial_events:{postgres=arwdDxtm/postgres,service_role=r/postgres},public.financial_funds:{postgres=arwdDxtm/postgres,authenticated=arw/postgres,service_role=r/postgres},public.financial_ledger_epochs:{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres},public.financial_postings:{postgres=arwdDxtm/postgres,service_role=r/postgres},public.get_financial_cashbook(p_group_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_account_id uuid, p_currency text, p_offset integer, p_limit integer):{postgres=X/postgres,authenticated=X/postgres},public.get_financial_projection_bundle(p_group_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_as_of_exclusive timestamp with time zone):{postgres=X/postgres,authenticated=X/postgres},public.post_financial_command(p_command jsonb):{postgres=X/postgres,authenticated=X/postgres},public.post_financial_opening_cash(p_command jsonb):{postgres=X/postgres,authenticated=X/postgres}",
    "policy": "public.financial_ledger_epochs.financial_ledger_epoch_active_reader:SELECT:{authenticated}:(EXISTS ( SELECT 1\n   FROM memberships m\n  WHERE ((m.group_id = financial_ledger_epochs.group_id) AND (m.user_id = auth.uid()) AND (m.membership_status = 'active'::text)))):,public.financial_accounts.financial_accounts_manager_select:SELECT:{authenticated}:( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances):,public.financial_accounts.financial_accounts_manager_insert:INSERT:{authenticated}::( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances),public.financial_accounts.financial_accounts_manager_update:UPDATE:{authenticated}:( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances):( SELECT financial_core.can_manage_finances(financial_accounts.group_id) AS can_manage_finances),public.financial_funds.financial_funds_manager_select:SELECT:{authenticated}:( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances):,public.financial_funds.financial_funds_manager_insert:INSERT:{authenticated}::( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances),public.financial_funds.financial_funds_manager_update:UPDATE:{authenticated}:( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances):( SELECT financial_core.can_manage_finances(financial_funds.group_id) AS can_manage_finances),public.financial_categories.financial_categories_manager_select:SELECT:{authenticated}:( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances):,public.financial_categories.financial_categories_manager_insert:INSERT:{authenticated}::(( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances) AND (NOT is_system)),public.financial_categories.financial_categories_manager_update:UPDATE:{authenticated}:(( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances) AND (NOT is_system)):(( SELECT financial_core.can_manage_finances(financial_categories.group_id) AS can_manage_finances) AND (NOT is_system)),public.financial_events.financial_events_finance_reader:SELECT:{authenticated}:( SELECT financial_core.can_view_finances(financial_events.group_id) AS can_view_finances):,public.financial_postings.financial_postings_finance_reader:SELECT:{authenticated}:( SELECT financial_core.can_view_finances(financial_postings.group_id) AS can_view_finances):",
    "schema": "financial_core:postgres,financial_private:postgres",
    "function_owner": "financial_core.format_projection_amount(p_amount numeric, p_currency text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.projection_cashbook_rows(p_group_id uuid, p_include_audit boolean):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_f3_correction_payload():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_f3_posting_closure():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.f3_correction_reason(p jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_correction_canonical(p jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_correction_fingerprint(p jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_correction_timestamp(p timestamp with time zone):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_correction_signed_amount(p numeric, c text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_correction_child_id(g uuid, r uuid, role text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_correction_posting_json(id uuid, event_id uuid, g uuid, epoch uuid, c text, occurred timestamp with time zone, amount numeric, control financial_control_class, account uuid, fund uuid, category uuid, cat_class financial_category_class, member uuid, project uuid):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.resolve_f3_correction_replacement(d jsonb, target jsonb, replay boolean):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.assert_f3_correction_postings(event uuid, expected jsonb):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_f3_correction_lineage():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.check_f3_correction_closure():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.correct_f3_command(cmd jsonb):postgres:true:{\"search_path=\\\"\\\"\"},public.correct_financial_event(p_command jsonb):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_f3_opening_provenance():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.post_f3_opening_cash(p_command jsonb):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.f3_opening_safe_text(p_value text, p_max integer, p_required boolean):postgres:false:{\"search_path=\\\"\\\"\"},public.post_financial_opening_cash(p_command jsonb):postgres:true:{\"search_path=\\\"\\\"\"},public.get_financial_projection_bundle(p_group_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_as_of_exclusive timestamp with time zone):postgres:true:{\"search_path=\\\"\\\"\"},public.get_financial_cashbook(p_group_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_account_id uuid, p_currency text, p_offset integer, p_limit integer):postgres:true:{\"search_path=\\\"\\\"\"},financial_private.guard_ledger_epoch():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_posting_history():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.check_event_balance_from_event():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_account():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_fund():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_category():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_event_epoch():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.guard_financial_event_history():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.assert_financial_event_balanced(p_event_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.check_event_balance_from_posting():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.lock_financial_occurrence(p_group_id uuid, p_source_module text, p_source_record_id text, p_effect_kind text, p_ledger_epoch_id uuid):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.currency_scale(p_currency text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.can_manage_finances(p_group_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.can_view_finances(p_group_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.assert_finances_manage(p_group_id uuid):postgres:true:{\"search_path=\\\"\\\"\"},financial_core.f3_uuid(p_value jsonb, p_optional boolean):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_currency(p_value jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.guard_f3_payload():postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_amount(p_value jsonb, p_currency text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_timestamp(p_value jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_trim(p_text text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_canonical(p_payload jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.f3_fingerprint(p_payload jsonb):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.check_f3_posting_closure():postgres:true:{\"search_path=\\\"\\\"\"},financial_core.lock_f3_identity(p_group uuid, p_request uuid, p_module text, p_source text, p_effect text):postgres:false:{\"search_path=\\\"\\\"\"},financial_core.post_f3_command(p_command jsonb, p_opening jsonb):postgres:true:{\"search_path=\\\"\\\"\"},public.post_financial_command(p_command jsonb):postgres:true:{\"search_path=\\\"\\\"\"}",
    "f3_objects_absent": false,
    "migration_file": "00123_f3_05_opening_cash_command.sql",
    "migration_version": "20260913173005",
    "migration_name": "00123_f3_05_opening_cash_command",
    "migration_digest": "0c8af9d755e5329ca58d6c5ae967fbe5b18e3e41bb836c934cfea0c06afce96d",
    "recognition": [
      "manual_income"
    ]
  }
};

export const FROZEN_EXPECTED_FINGERPRINT_SHA256 = Object.freeze({
  "00118_f3_bounded_financial_epoch_foundation.sql": "a1538e7d2d451c198350535128ece77cbe54ad31cd11d6d902f7efc0ece231c5",
  "00119_f3_01_core_ledger_foundation.sql": "422c5d8b22ae4c07f59261f09988afccf80efb85f3c05dc5c3c91063a12f7f4c",
  "00120_f3_02_secure_posting_idempotency.sql": "1f5433b99ee60148fe708c51e576ce50cf082e8279e32057aa8e0e1a2e450610",
  "00121_f3_03_projection_read_proof.sql": "6705f7bb63cf18eda2b22bace9ff69c2c915207238f760437eccf08441e95c3c",
  "00122_f3_04_correction_reversal.sql": "e84cf051957897be0434d6b2fb71a3f4317228080d994110ec4470b8cb97b9ee",
  "00123_f3_05_opening_cash_command.sql": "3ff28c4c5f3f31c05014febd2c4e25158b597048f5e1e3bc7ea23a1d7ef40b66"
});


function assertSealedExpectedHashesAtLoad() {
  const frozen = {};
  for (const file of Object.keys(FROZEN_EXPECTED_FINGERPRINTS_RAW)) {
    frozen[file] = deepFreeze(FROZEN_EXPECTED_FINGERPRINTS_RAW[file]);
  }
  deepFreeze(frozen);
  for (const file of Object.keys(FROZEN_EXPECTED_FINGERPRINT_SHA256)) {
    const actual = fingerprintCanonicalSha256(frozen[file]);
    const sealed = FROZEN_EXPECTED_FINGERPRINT_SHA256[file];
    if (actual !== sealed) {
      throw new Error(
        `HOLD: frozen expected fingerprint hash mismatch for ${file} (module-load, before any DB access)`,
      );
    }
  }
  for (const file of F3_FORWARD_FILES) {
    if (!frozen[file] || !FROZEN_EXPECTED_FINGERPRINT_SHA256[file]) {
      throw new Error(`HOLD: missing frozen expected fingerprint for ${file}`);
    }
  }
  return frozen;
}

export function fingerprintCanonicalSha256(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value)), "utf8").digest("hex");
}

export const FROZEN_EXPECTED_FINGERPRINTS = assertSealedExpectedHashesAtLoad();

function requireFrozenFile(file) {
  if (!FROZEN_EXPECTED_FINGERPRINTS[file]) {
    throw new Error(`HOLD: no frozen expected fingerprint for ${file}`);
  }
  return file;
}

export function getFrozenExpectedFingerprint(file) {
  const pin = requireFrozenFile(file);
  return structuredClone(FROZEN_EXPECTED_FINGERPRINTS[pin]);
}

export function expectedFingerprintSha256(file) {
  const pin = requireFrozenFile(file);
  return FROZEN_EXPECTED_FINGERPRINT_SHA256[pin];
}

export function assertExpectedFingerprintImmutable(file) {
  const pin = requireFrozenFile(file);
  const recomputed = fingerprintCanonicalSha256(FROZEN_EXPECTED_FINGERPRINTS[pin]);
  const sealed = FROZEN_EXPECTED_FINGERPRINT_SHA256[pin];
  if (recomputed !== sealed) {
    throw new Error(`HOLD: expected fingerprint mutated for ${pin}`);
  }
  return { file: pin, sha256: recomputed, unchanged: true };
}

export function recordPreDbExpectedHashes() {
  const sha256BeforeDb = {};
  for (const file of F3_FORWARD_FILES) {
    assertExpectedFingerprintImmutable(file);
    sha256BeforeDb[file] = expectedFingerprintSha256(file);
  }
  return Object.freeze({
    recordedBeforeDbAccess: true,
    independentOfObserved: true,
    constructedOffline: true,
    sha256BeforeDb: Object.freeze(sha256BeforeDb),
  });
}

function frozenMigrationName(file) {
  return String(file).replace(/\.sql$/i, "");
}

/**
 * Observed catalog fields come ONLY from the live CATALOG_FINGERPRINT_SQL
 * inventory. Meta fields come ONLY from frozen pins / PREASSIGNED_VERSIONS /
 * FROZEN_DIGESTS / recognition allowlist. Never copies expected↔observed.
 */
export function buildIndependentObservedFingerprint(file, catalogInventory) {
  if (!F3_FORWARD_FILES.includes(file)) {
    throw new Error(`HOLD: unknown file ${file}`);
  }
  if (catalogInventory == null || typeof catalogInventory !== "object" || Array.isArray(catalogInventory)) {
    return {
      migration_file: file,
      migration_version: PREASSIGNED_VERSIONS[file],
      migration_name: frozenMigrationName(file),
      migration_digest: FROZEN_DIGESTS[file],
      recognition: [...RECOGNITION_ALLOWLIST],
    };
  }
  const observed = {};
  const catalogKeyAllow = new Set([...FINGERPRINT_REQUIRED_KEYS, ...FINGERPRINT_OPTIONAL_CATALOG_KEYS]);
  for (const key of Object.keys(catalogInventory)) {
    if (catalogKeyAllow.has(key)) {
      observed[key] = catalogInventory[key];
    }
  }
  observed.migration_file = file;
  observed.migration_version = PREASSIGNED_VERSIONS[file];
  observed.migration_name = frozenMigrationName(file);
  observed.migration_digest = FROZEN_DIGESTS[file];
  observed.recognition = [...RECOGNITION_ALLOWLIST];
  return observed;
}

function normalizeSetLikeString(value) {
  if (typeof value !== "string") return value;
  const parts = value.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
  parts.sort();
  return parts.join(",");
}

function canonicalizeForCompare(value, key = null) {
  if (key && FINGERPRINT_SET_LIKE_STRING_KEYS.includes(key) && typeof value === "string") {
    return normalizeSetLikeString(value);
  }
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const items = value.map((item) => canonicalizeForCompare(item));
    if (items.every((item) => item === null || typeof item !== "object")) {
      return [...items].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }
    return items;
  }
  const out = {};
  for (const k of Object.keys(value).sort()) {
    out[k] = canonicalizeForCompare(value[k], k);
  }
  return out;
}

export function canonicalFingerprintEqual(a, b) {
  return JSON.stringify(canonicalizeForCompare(a)) === JSON.stringify(canonicalizeForCompare(b));
}


/**
 * Marker list is retained for evidence/docs only. Authorization MUST NOT
 * use substring / marker approximation.
 */
export const FINGERPRINT_REQUIRED_MARKERS = Object.freeze({
  "00118_f3_bounded_financial_epoch_foundation.sql": Object.freeze(["financial_private"]),
  "00119_f3_01_core_ledger_foundation.sql": Object.freeze(["financial_core", "financial_private"]),
  "00120_f3_02_secure_posting_idempotency.sql": Object.freeze(["financial_core", "post_financial_command"]),
  "00121_f3_03_projection_read_proof.sql": Object.freeze([
    "financial_core",
    "get_financial_projection_bundle",
  ]),
  "00122_f3_04_correction_reversal.sql": Object.freeze(["financial_core", "correct_financial_event"]),
  "00123_f3_05_opening_cash_command.sql": Object.freeze([
    "financial_core",
    "post_financial_opening_cash",
  ]),
});

export const POISON_TRIGGER_NAME = "trg_f3_dbpush_fail_target_history";
export const POISON_FUNCTION_REGPROCEDURE =
  "supabase_migrations.f3_dbpush_fail_target_history()";

export const POISON_ABSENT_PROBE_SQL = `
SELECT jsonb_build_object(
  'trigger_present', EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname = '${POISON_TRIGGER_NAME}'
      AND n.nspname = 'supabase_migrations'
      AND NOT t.tgisinternal
  ),
  'function_present', to_regprocedure('${POISON_FUNCTION_REGPROCEDURE}') IS NOT NULL
);
`;

const SQL_FAILURE_LINE = /(?:^|[\s:])(?:ERROR|FATAL|PANIC):/i;
const ENVELOPE_ALLOWED_KEYS = Object.freeze(["rows", "advisory", "warning"]);

export function textOf(input) {
  return `${input?.stdout || ""}\n${input?.stderr || ""}\n${input?.output || ""}`;
}

export function hasSqlFailureOutput(text) {
  return String(text || "")
    .split(/\r?\n/)
    .some((line) => SQL_FAILURE_LINE.test(line));
}

export function extractSqlFailureLines(text) {
  const fromPsql = extractPsqlErrorLines(text);
  const extra = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => {
      if (!line) return false;
      if (/^\s*(NOTICE|WARNING):/i.test(line)) return false;
      return /(?:^|[\s:])(?:FATAL|PANIC):/i.test(line);
    });
  return [...fromPsql, ...extra];
}

export function hasTargetSpecificInjectMarker(text, version) {
  const blob = String(text || "");
  if (!blob.includes(HISTORY_INJECT_MARKER)) return false;
  if (!String(version || "")) return false;
  const v = String(version);
  return (
    blob.includes(`version ${v}`) ||
    blob.includes(`for version ${v}`) ||
    new RegExp(`${HISTORY_INJECT_MARKER}[^\\n]*${v}`).test(blob)
  );
}

export function unrelatedMigrationSqlErrors(text, version, extraText = "") {
  const combined = extraText ? `${text || ""}\n${extraText}` : text;
  const lines = extractSqlFailureLines(combined);
  return lines.filter((line) => {
    if (hasTargetSpecificInjectMarker(line, version)) return false;
    if (line.includes(HISTORY_INJECT_MARKER) && String(line).includes(String(version))) {
      return false;
    }
    return true;
  });
}

export function canonicalize(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = canonicalize(value[key]);
  }
  return out;
}

export function canonicalDeepEqual(a, b) {
  return JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));
}

function sameKeySet(a, b) {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.length !== kb.length) return false;
  return ka.every((key, i) => key === kb[i]);
}

function parseEntireJson(stdout) {
  if (stdout == null) return { ok: false, reason: "stdout missing" };
  const raw = String(stdout).trim();
  if (!raw) return { ok: false, reason: "empty" };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, reason: "non-JSON" };
  }
}

export function expectedIdentitiesForExpression(expression) {
  const quoted = String(expression || "").match(/'([^']+)'/);
  if (!quoted) return Object.freeze([]);
  const full = quoted[1];
  const identities = new Set([full]);
  if (full.includes(".")) {
    identities.add(full.slice(full.lastIndexOf(".") + 1));
  }
  return Object.freeze([...identities]);
}

export function expectedRowForFile(file) {
  const expressions = TARGET_OBJECT_PROBES[file] || [];
  const row = {};
  expressions.forEach((expr, i) => {
    row[`p${i}`] = expectedIdentitiesForExpression(expr);
  });
  return row;
}

function rowFromSupportedProbeSchema(parsed) {
  if (Array.isArray(parsed)) {
    if (parsed.length !== 1) return { ok: false, reason: "wrong JSON shape: expected exactly one row" };
    const row = parsed[0];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return { ok: false, reason: "wrong JSON shape: row is not an object" };
    }
    return { ok: true, schema: "array_rows", row };
  }
  if (parsed && typeof parsed === "object") {
    const unexpected = Object.keys(parsed).filter((k) => !ENVELOPE_ALLOWED_KEYS.includes(k));
    if (unexpected.length > 0 && !Array.isArray(parsed.rows)) {
      return { ok: false, reason: "wrong JSON shape" };
    }
    if (!Array.isArray(parsed.rows)) {
      return { ok: false, reason: "wrong JSON shape: missing rows" };
    }
    if (parsed.rows.length !== 1) {
      return { ok: false, reason: "wrong JSON shape: expected exactly one row" };
    }
    const row = parsed.rows[0];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return { ok: false, reason: "wrong JSON shape: row is not an object" };
    }
    return { ok: true, schema: "envelope_rows", row };
  }
  return { ok: false, reason: "wrong JSON shape" };
}

function valueIsExactIdentity(observed, allowed) {
  if (typeof observed !== "string") return false;
  return allowed.includes(observed);
}

/**
 * Strict object-probe parse. No substring / marker fallback.
 * Presence is accepted ONLY when every listed condition holds.
 */
export function evaluateObjectProbe(result = {}, { file, expressions } = {}) {
  if (result == null || typeof result !== "object") {
    return { present: false, reason: "probe result missing" };
  }
  if (result.status !== 0) {
    return { present: false, reason: `probe status ${result.status}` };
  }
  const blob = textOf(result);
  if (hasSqlFailureOutput(blob)) {
    return { present: false, reason: "probe SQL error", errors: extractSqlFailureLines(blob) };
  }
  const parsedStdout = parseEntireJson(result.stdout);
  if (!parsedStdout.ok) {
    return { present: false, reason: parsedStdout.reason };
  }
  const shaped = rowFromSupportedProbeSchema(parsedStdout.value);
  if (!shaped.ok) return { present: false, reason: shaped.reason };

  const targetFile = file || result.file;
  const exprs = expressions || result.expressions || TARGET_OBJECT_PROBES[targetFile] || null;
  if (!Array.isArray(exprs) || exprs.length === 0) {
    return { present: false, reason: "expected probe expressions missing" };
  }

  const expectedKeys = exprs.map((_, i) => `p${i}`);
  const observedKeys = Object.keys(shaped.row).sort();
  const expectedKeySet = [...expectedKeys].sort();
  if (!sameKeySet(Object.fromEntries(expectedKeySet.map((k) => [k, true])), Object.fromEntries(observedKeys.map((k) => [k, true])))) {
    return { present: false, reason: "probe row keys are not the complete expected pN set" };
  }

  const missing = [];
  for (let i = 0; i < exprs.length; i += 1) {
    const key = `p${i}`;
    const allowed = expectedIdentitiesForExpression(exprs[i]);
    const observed = shaped.row[key];
    if (observed == null || observed === false || observed === "f" || observed === "") {
      missing.push(key);
      continue;
    }
    if (!valueIsExactIdentity(observed, allowed)) {
      return { present: false, reason: `p${i} is not an exact structured identity` };
    }
  }
  if (missing.length > 0) {
    return { present: false, reason: `required object missing: ${missing.join(",")}` };
  }
  return { present: true, schema: shaped.schema, row: shaped.row };
}

export function objectsPresentFromProbe(result, options) {
  return evaluateObjectProbe(result, options).present === true;
}

export function fingerprintCompleteAndExact(fingerprint, file) {
  if (!fingerprint || typeof fingerprint !== "object" || Array.isArray(fingerprint)) {
    return { ok: false, reason: "fingerprint missing or not an object" };
  }
  const expected = fingerprint.expected;
  const observed = fingerprint.observed;
  if (expected == null || typeof expected !== "object" || Array.isArray(expected)) {
    return { ok: false, reason: "fingerprint.expected missing or not an object" };
  }
  if (observed == null || typeof observed !== "object" || Array.isArray(observed)) {
    return { ok: false, reason: "fingerprint.observed missing or not an object" };
  }
  const expectedHashBefore = fingerprintCanonicalSha256(expected);
  const allowed = new Set(FINGERPRINT_ALLOWED_KEYS);
  for (const key of new Set([...Object.keys(expected), ...Object.keys(observed)])) {
    if (!allowed.has(key)) {
      return { ok: false, reason: `unexpected fingerprint key ${key}` };
    }
  }
  for (const key of FINGERPRINT_REQUIRED_KEYS) {
    if (!(key in expected) || expected[key] == null) {
      return { ok: false, reason: `expected missing key ${key}` };
    }
    if (!(key in observed) || observed[key] == null) {
      return { ok: false, reason: `observed missing key ${key}` };
    }
  }
  const presentCatalog = new Set();
  for (const key of [...FINGERPRINT_REQUIRED_KEYS, ...FINGERPRINT_OPTIONAL_CATALOG_KEYS]) {
    if (Object.prototype.hasOwnProperty.call(expected, key) || Object.prototype.hasOwnProperty.call(observed, key)) {
      presentCatalog.add(key);
    }
  }
  for (const key of presentCatalog) {
    if (!Object.prototype.hasOwnProperty.call(expected, key)) {
      return { ok: false, reason: `expected missing key ${key}` };
    }
    if (!Object.prototype.hasOwnProperty.call(observed, key)) {
      return { ok: false, reason: `observed missing key ${key}` };
    }
  }
  if (!sameKeySet(expected, observed)) {
    return { ok: false, reason: "expected/observed key sets differ (missing or unexpected keys)" };
  }
  if (expected.f3_objects_absent === true || observed.f3_objects_absent === true) {
    return { ok: false, reason: "fingerprint f3_objects_absent is true after target apply" };
  }
  if (!canonicalFingerprintEqual(expected, observed)) {
    return { ok: false, reason: "fingerprint expected and observed are not canonically equal" };
  }
  const expectedHashAfter = fingerprintCanonicalSha256(expected);
  if (expectedHashBefore !== expectedHashAfter) {
    return { ok: false, reason: "expected fingerprint mutated during compare" };
  }
  const pinFile = file || expected.migration_file;
  if (pinFile && FROZEN_EXPECTED_FINGERPRINT_SHA256[pinFile]) {
    if (expectedHashAfter !== FROZEN_EXPECTED_FINGERPRINT_SHA256[pinFile]) {
      return { ok: false, reason: "expected fingerprint is not the sealed frozen constant" };
    }
    assertExpectedFingerprintImmutable(pinFile);
  }
  return { ok: true };
}

function poisonRowFromSupportedSchema(parsed) {
  if (Array.isArray(parsed)) {
    if (parsed.length !== 1) return { ok: false, reason: "verify malformed: expected one row" };
    const row = parsed[0];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return { ok: false, reason: "verify malformed: row is not an object" };
    }
    if (row.jsonb_build_object && typeof row.jsonb_build_object === "object") {
      return { ok: true, row: row.jsonb_build_object };
    }
    return { ok: true, row };
  }
  if (parsed && typeof parsed === "object") {
    if (Array.isArray(parsed.rows)) {
      if (parsed.rows.length !== 1) return { ok: false, reason: "verify malformed: expected one row" };
      const row = parsed.rows[0];
      if (row?.jsonb_build_object && typeof row.jsonb_build_object === "object") {
        return { ok: true, row: row.jsonb_build_object };
      }
      return { ok: true, row };
    }
    if ("trigger_present" in parsed || "function_present" in parsed) {
      return { ok: true, row: parsed };
    }
    if (parsed.jsonb_build_object && typeof parsed.jsonb_build_object === "object") {
      return { ok: true, row: parsed.jsonb_build_object };
    }
  }
  return { ok: false, reason: "verify malformed: unsupported schema" };
}

export function evaluatePoisonAbsent(result) {
  if (result == null || typeof result !== "object") {
    return { ok: false, absent: false, reason: "verify result missing" };
  }
  if (result.status !== 0) {
    return { ok: false, absent: false, reason: `verify status ${result.status}` };
  }
  const blob = textOf(result);
  if (hasSqlFailureOutput(blob)) {
    return { ok: false, absent: false, reason: "verify SQL error", errors: extractSqlFailureLines(blob) };
  }
  const parsed = parseEntireJson(result.stdout);
  if (!parsed.ok) {
    return { ok: false, absent: false, reason: `verify malformed: ${parsed.reason}` };
  }
  const shaped = poisonRowFromSupportedSchema(parsed.value);
  if (!shaped.ok) return { ok: false, absent: false, reason: shaped.reason };
  const row = shaped.row;
  if (!row || typeof row !== "object") {
    return { ok: false, absent: false, reason: "verify malformed: no structured row" };
  }
  if (!("trigger_present" in row) || !("function_present" in row)) {
    return { ok: false, absent: false, reason: "verify malformed: missing trigger_present/function_present" };
  }
  if (row.trigger_present !== false) {
    return { ok: false, absent: false, reason: "poison trigger remains present" };
  }
  if (row.function_present !== false) {
    return { ok: false, absent: false, reason: "poison function remains present" };
  }
  return { ok: true, absent: true, row };
}

export function poisonAbsentFromProbe(result) {
  return evaluatePoisonAbsent(result).absent === true;
}

export function evaluateCleanupProven(result) {
  if (result == null || typeof result !== "object" || Array.isArray(result)) {
    return { ok: false, reason: "cleanup result missing or not an object" };
  }
  if (!Object.prototype.hasOwnProperty.call(result, "status") || result.status !== 0) {
    return { ok: false, reason: `cleanup status ${result.status}` };
  }
  const blob = textOf(result);
  if (hasSqlFailureOutput(blob)) {
    return { ok: false, reason: "cleanup output contains SQL error", errors: extractSqlFailureLines(blob) };
  }
  return { ok: true };
}

export function authorizedStagedFilename(file) {
  if (!F3_FORWARD_FILES.includes(file)) {
    throw new Error(`HOLD: ${file} is not an authorized F3 forward file`);
  }
  return timestampFilenameFor(file);
}

export function listIsolatedMigrationFilenames(workdir) {
  const migDir = path.join(workdir, "supabase", "migrations");
  if (!fs.existsSync(migDir)) return [];
  return fs.readdirSync(migDir).sort();
}

/**
 * Stage exactly one intended F3 timestamp migration in the isolated workdir.
 * Unexpected files block. Authorized non-target files are cleaned from the
 * staged directory. Repository migration bytes are never rewritten.
 */
export function syncIsolatedMigrationsThrough(isolated, throughFile) {
  if (!isolated?.workdir) {
    throw new Error("HOLD: isolated workdir required for staging");
  }
  const intended = authorizedStagedFilename(throughFile);
  const authorized = new Set(F3_FORWARD_FILES.map((f) => timestampFilenameFor(f)));
  const migDir = path.join(isolated.workdir, "supabase", "migrations");
  if (!fs.existsSync(migDir)) {
    throw new Error("HOLD: isolated migrations directory missing");
  }

  const names = fs.readdirSync(migDir);
  const unexpected = names.filter((name) => !authorized.has(name));
  if (unexpected.length > 0) {
    const err = new Error(
      `HOLD: unexpected isolated migration files block execution: ${unexpected.join(",")}`,
    );
    err.code = "F3_DBPUSH_STAGING_UNEXPECTED_FILES";
    throw err;
  }

  for (const name of names) {
    if (name !== intended) {
      fs.rmSync(path.join(migDir, name), { force: true });
    }
  }

  const dest = path.join(migDir, intended);
  if (!fs.existsSync(dest)) {
    const copy = (isolated.copies || []).find((c) => c.destName === intended);
    const sourceFile = copy?.sourceFile || throughFile;
    const src = path.join(repoRoot, "supabase", "migrations", sourceFile);
    if (!fs.existsSync(src)) {
      throw new Error(`HOLD: authorized source missing for ${sourceFile}`);
    }
    fs.writeFileSync(dest, fs.readFileSync(src));
  }

  const staged = fs.readdirSync(migDir).filter((name) => name.endsWith(".sql")).sort();
  if (staged.length !== 1 || staged[0] !== intended) {
    const err = new Error(`HOLD: staging did not leave exactly the intended migration ${intended}`);
    err.code = "F3_DBPUSH_STAGING_INEXACT";
    throw err;
  }
  return staged;
}

function disposableIdentityOk(input) {
  if (input.disposableIdentityVerified === true) return true;
  if (input.disposableIdentityVerified === false) return false;
  const ref = input.projectRef || input.identity?.ref || input.identity?.id;
  const name = input.projectName || input.identity?.name;
  const org = input.orgId || input.identity?.organization_id || input.identity?.org;
  const host = input.host || input.identity?.host;
  if (!ref && !name && !org && !host && input.disposableIdentityVerified == null) {
    return false;
  }
  return (
    ref === APPROVED_DISPOSABLE_PROJECT_REF &&
    (name == null || name === APPROVED_DISPOSABLE_PROJECT_NAME) &&
    (org == null || org === APPROVED_DISPOSABLE_ORG_ID) &&
    (host == null || host === APPROVED_DISPOSABLE_HOST)
  );
}

function productionRejectedOk(input) {
  if (input.productionIdentityRejected === true) return true;
  if (input.productionIdentityRejected === false) return false;
  const ref = input.projectRef || input.identity?.ref || input.identity?.id;
  if (ref == null) return false;
  return ref !== PRODUCTION_REF;
}

export function evaluateRepairSafetyGate(input = {}) {
  const file = input.file;
  const version = input.targetVersion || PREASSIGNED_VERSIONS[file];
  const gates = [];
  const fail = (id, detail) => {
    gates.push({ id, ok: false, detail });
  };
  const pass = (id, detail) => {
    gates.push({ id, ok: true, detail: detail || true });
  };

  if (!F3_FORWARD_FILES.includes(file)) {
    fail("authorized_file", `unknown file ${file}`);
  } else {
    pass("authorized_file");
  }

  if (!disposableIdentityOk(input)) {
    fail("disposable_identity", "exact disposable identity not verified");
  } else {
    pass("disposable_identity");
  }

  if (!productionRejectedOk(input)) {
    fail("production_rejected", "production identity was not rejected");
  } else {
    pass("production_rejected");
  }

  if (input.cliVersion !== CLI_PIN) {
    fail("cli_pin", `cliVersion=${input.cliVersion} required=${CLI_PIN}`);
  } else {
    pass("cli_pin");
  }

  const intendedName = F3_FORWARD_FILES.includes(file) ? timestampFilenameFor(file) : null;
  const staged = Array.isArray(input.stagedMigrations) ? input.stagedMigrations : null;
  if (!staged || staged.length !== 1 || staged[0] !== intendedName) {
    fail("staged_exact_one", `staged=${JSON.stringify(staged)} intended=${intendedName}`);
  } else {
    pass("staged_exact_one");
  }

  const injectInstalled =
    input.injectInstalled === true ||
    Number(input.injectStatus) === 0 ||
    input.injectOk === true;
  const injectTargetsVersion =
    String(input.injectSql || "").includes(String(version)) &&
    String(input.injectSql || "").includes(HISTORY_INJECT_MARKER);
  if (!injectInstalled || (input.injectSql != null && !injectTargetsVersion)) {
    fail("inject_installed_exact_version", "failure injection not installed for exact target version");
  } else {
    pass("inject_installed_exact_version");
  }

  const nonzero = input.exitStatus !== 0 && input.exitStatus != null;
  if (!nonzero) fail("nonzero_exit", `exitStatus=${input.exitStatus}`);
  else pass("nonzero_exit");

  const output = textOf(input);
  if (!hasTargetSpecificInjectMarker(output, version)) {
    fail("target_inject_marker", "missing target-specific history-failure marker");
  } else {
    pass("target_inject_marker");
  }

  const probe = input.probe;
  const probeText = probe ? textOf(probe) : textOf({
    stdout: input.probeStdout,
    stderr: input.probeStderr,
    output: input.probeOutput,
  });
  const unrelated = unrelatedMigrationSqlErrors(output, version, probeText);
  if (unrelated.length > 0) {
    fail("no_unrelated_sql_error", unrelated[0]);
  } else {
    pass("no_unrelated_sql_error");
  }

  const rows = Array.isArray(input.historyRows) ? input.historyRows : [];
  const present = rows.some((row) => String(row?.version) === String(version));
  if (present) fail("target_history_absent", "target version unexpectedly present");
  else pass("target_history_absent");

  const probeResult = probe || (
    input.probeStatus != null || input.probeStdout != null || input.probeStderr != null
      ? { status: input.probeStatus, stdout: input.probeStdout, stderr: input.probeStderr, file }
      : null
  );
  const probeEval = evaluateObjectProbe(probeResult || {}, { file });
  const objectsOk = probeEval.present === true;
  if (!objectsOk) {
    fail("expected_objects", probeEval.reason || `objectsPresent=${input.objectsPresent}`);
  } else {
    pass("expected_objects");
  }
  if (input.securityPostconditionsOk === false || !objectsOk) {
    fail(
      "security_postconditions",
      objectsOk ? "security postconditions missing" : "objects missing so security postconditions not proven",
    );
  } else {
    pass("security_postconditions");
  }

  const fp = fingerprintCompleteAndExact(input.fingerprint, file);
  if (!fp.ok) fail("fingerprint_exact", fp.reason);
  else pass("fingerprint_exact");

  const authorized = FROZEN_DIGESTS[file];
  const digestOk =
    input.digest === authorized &&
    (input.onDiskDigest == null || input.onDiskDigest === authorized);
  if (!digestOk) fail("sql_digest", `digest ${input.digest} != ${authorized}`);
  else pass("sql_digest");

  const ok = gates.every((g) => g.ok);
  const originalError =
    unrelated[0] ||
    (hasTargetSpecificInjectMarker(output, version) ? null : extractSqlFailureLines(output)[0]) ||
    input.originalSqlError ||
    null;
  return {
    ok,
    repairAuthorized: ok,
    continuation: ok,
    gates,
    failedGates: gates.filter((g) => !g.ok).map((g) => g.id),
    hold: ok ? null : REPAIR_SAFETY_HOLD,
    originalSqlError: originalError,
    poisonCleanupOnly: !ok,
    nextMigration: ok,
    objectProbe: probeEval,
  };
}

async function invokeMaybeAsync(fn) {
  return await Promise.resolve(fn());
}

/**
 * Classify, then maybe repair. Cleanup always runs (finally-style).
 * Repair is invoked only when the gate authorizes AND cleanup exits 0
 * with no SQL error AND a separate probe proves poison is absent.
 * Optional teardown is recorded separately and never counted as cleanup success.
 */
export async function runRepairSafetyThenMaybeRepair({
  gateInput,
  cleanup,
  verifyPoisonAbsent,
  repair,
  teardown,
} = {}) {
  const gate = evaluateRepairSafetyGate(gateInput);
  let cleanupResult = null;
  let cleanupError = null;
  let verifyResult = null;
  let verifyEval = { ok: false, absent: false, reason: "verify not run" };
  let repairResult = null;
  let repairAttempted = false;
  let teardownResult = null;
  let teardownRecorded = false;

  try {
    if (typeof cleanup === "function") {
      try {
        cleanupResult = await invokeMaybeAsync(cleanup);
      } catch (err) {
        cleanupError = err;
        cleanupResult = { threw: true, error: String(err?.message || err) };
      }
    } else {
      cleanupResult = { missing: true };
    }

    const cleanupProof = evaluateCleanupProven(cleanupResult);
    const cleanupOk = cleanupProof.ok === true && cleanupError == null;

    if (gate.ok && cleanupOk && typeof verifyPoisonAbsent === "function") {
      try {
        verifyResult = await invokeMaybeAsync(verifyPoisonAbsent);
        verifyEval = evaluatePoisonAbsent(verifyResult);
      } catch (err) {
        verifyResult = { threw: true, error: String(err?.message || err) };
        verifyEval = { ok: false, absent: false, reason: "verify threw", error: String(err?.message || err) };
      }
    } else if (gate.ok && cleanupOk && typeof verifyPoisonAbsent !== "function") {
      verifyEval = { ok: false, absent: false, reason: "verifyPoisonAbsent callback missing" };
    } else if (gate.ok && !cleanupOk) {
      verifyEval = { ok: false, absent: false, reason: cleanupProof.reason || "cleanup not proven" };
    }

    const repairAllowed = Boolean(gate.ok && cleanupOk && verifyEval.ok && verifyEval.absent === true);
    if (repairAllowed) {
      if (typeof repair !== "function") {
        throw new Error("HOLD: repair executor required after authorized gate");
      }
      repairAttempted = true;
      repairResult = await invokeMaybeAsync(repair);
    }
  } catch (err) {
    if (typeof teardown === "function" && !teardownRecorded) {
      try {
        teardownResult = await invokeMaybeAsync(teardown);
        teardownRecorded = true;
      } catch {
        /* teardown is never cleanup success */
      }
    }
    throw err;
  }

  if (typeof teardown === "function" && !teardownRecorded) {
    try {
      teardownResult = await invokeMaybeAsync(teardown);
      teardownRecorded = true;
    } catch (err) {
      teardownResult = { threw: true, error: String(err?.message || err) };
      teardownRecorded = true;
    }
  }

  const cleanupProof = evaluateCleanupProven(cleanupResult);
  const cleanupOk = cleanupProof.ok === true && cleanupError == null;
  const repairOk = !repairAttempted || (repairResult && repairResult.status === 0);
  return {
    gate,
    repairAuthorized: Boolean(gate.ok && cleanupOk && verifyEval.ok && verifyEval.absent === true),
    gateAuthorized: gate.ok,
    repairAttempted,
    repair: repairResult,
    continuation: Boolean(repairAttempted && repairOk),
    nextMigration: Boolean(repairAttempted && repairOk),
    cleanup: cleanupResult,
    cleanupError: cleanupError ? String(cleanupError.message || cleanupError) : null,
    cleanupProven: evaluateCleanupProven(cleanupResult).ok === true && cleanupError == null,
    verify: verifyResult,
    poisonAbsent: verifyEval.absent === true,
    poisonVerify: verifyEval,
    teardown: teardownResult,
    teardownRecorded,
    poisonCleanupOnly: true,
    repairOk,
  };
}
