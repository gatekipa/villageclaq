-- PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE
-- Label: NEW and UNAPPROVED — not an F12-supported command on tip 1ec0e4da782ed7715a543be23f79bc0f10a28af2
-- Derived from F8/F9 historical qualification-reset.sql sha256 0d3de029828173d5287694e61b4ca3394c4a57e81182cade059bf88d86515011
-- + F12 tip PREASSIGNED_VERSIONS / PREASSIGNED_NAMES
-- Target disposable jkorwnwwmdeflfntxntl ONLY. Reject production llbnliixczcqfftxpsmb.
-- NOT --wipe-to-baseline. Keep wipe flag rejected (F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH).
-- One constrained reset. Restart qualify from 00118.
-- STOP BEFORE MUTATION until target-binding + allowlist checks pass.

BEGIN;
DROP SCHEMA IF EXISTS financial_core CASCADE;
DROP SCHEMA IF EXISTS financial_private CASCADE;
DROP TABLE IF EXISTS public."announcements" CASCADE;
DROP TABLE IF EXISTS public."contribution_obligations" CASCADE;
DROP TABLE IF EXISTS public."elections" CASCADE;
DROP TABLE IF EXISTS public."events" CASCADE;
DROP TABLE IF EXISTS public."financial_accounts" CASCADE;
DROP TABLE IF EXISTS public."financial_categories" CASCADE;
DROP TABLE IF EXISTS public."financial_events" CASCADE;
DROP TABLE IF EXISTS public."financial_funds" CASCADE;
DROP TABLE IF EXISTS public."financial_ledger_epochs" CASCADE;
DROP TABLE IF EXISTS public."financial_postings" CASCADE;
DROP TABLE IF EXISTS public."fines" CASCADE;
DROP TABLE IF EXISTS public."group_positions" CASCADE;
DROP TABLE IF EXISTS public."group_subscriptions" CASCADE;
DROP TABLE IF EXISTS public."groups" CASCADE;
DROP TABLE IF EXISTS public."hosting_assignments" CASCADE;
DROP TABLE IF EXISTS public."hosting_rosters" CASCADE;
DROP TABLE IF EXISTS public."hosting_swap_requests" CASCADE;
DROP TABLE IF EXISTS public."invitations" CASCADE;
DROP TABLE IF EXISTS public."loans" CASCADE;
DROP TABLE IF EXISTS public."meeting_minutes" CASCADE;
DROP TABLE IF EXISTS public."member_transfers" CASCADE;
DROP TABLE IF EXISTS public."memberships" CASCADE;
DROP TABLE IF EXISTS public."notification_policies" CASCADE;
DROP TABLE IF EXISTS public."notification_policy_occurrences" CASCADE;
DROP TABLE IF EXISTS public."notification_policy_triggers" CASCADE;
DROP TABLE IF EXISTS public."notifications_queue" CASCADE;
DROP TABLE IF EXISTS public."organizations" CASCADE;
DROP TABLE IF EXISTS public."payment_obligation_applications" CASCADE;
DROP TABLE IF EXISTS public."payments" CASCADE;
DROP TABLE IF EXISTS public."position_assignments" CASCADE;
DROP TABLE IF EXISTS public."position_permissions" CASCADE;
DROP TABLE IF EXISTS public."profiles" CASCADE;
DROP TABLE IF EXISTS public."projects" CASCADE;
DROP TABLE IF EXISTS public."relief_claims" CASCADE;
DROP TABLE IF EXISTS public."relief_enrollments" CASCADE;
DROP TABLE IF EXISTS public."relief_plans" CASCADE;
DROP TABLE IF EXISTS public."relief_remittances" CASCADE;
DROP FUNCTION IF EXISTS post_financial_opening_cash(jsonb) CASCADE;
DROP FUNCTION IF EXISTS get_financial_cashbook(uuid,timestamp with time zone,timestamp with time zone,uuid,text,integer,integer) CASCADE;
DROP FUNCTION IF EXISTS get_financial_projection_bundle(uuid,timestamp with time zone,timestamp with time zone,timestamp with time zone) CASCADE;
DROP FUNCTION IF EXISTS post_financial_command(jsonb) CASCADE;
DROP FUNCTION IF EXISTS enqueue_outbound_notification(text,uuid,notification_channel,uuid,text) CASCADE;
DROP FUNCTION IF EXISTS execute_member_transfer(jsonb) CASCADE;
DROP FUNCTION IF EXISTS has_group_permission(uuid,text,uuid) CASCADE;
DROP FUNCTION IF EXISTS compute_member_standing(uuid) CASCADE;
DROP FUNCTION IF EXISTS request_member_transfer(jsonb) CASCADE;
DROP FUNCTION IF EXISTS m2_is_valid_iana_timezone(text) CASCADE;
DROP FUNCTION IF EXISTS notification_policy_set_updated_at() CASCADE;
DROP FUNCTION IF EXISTS uuid_generate_v5(uuid,text) CASCADE;
DROP FUNCTION IF EXISTS correct_financial_event(jsonb) CASCADE;
DROP TYPE IF EXISTS public."financial_account_kind" CASCADE;
DROP TYPE IF EXISTS public."financial_account_status" CASCADE;
DROP TYPE IF EXISTS public."financial_category_class" CASCADE;
DROP TYPE IF EXISTS public."financial_config_status" CASCADE;
DROP TYPE IF EXISTS public."financial_control_class" CASCADE;
DROP TYPE IF EXISTS public."financial_event_class" CASCADE;
DROP TYPE IF EXISTS public."financial_event_status" CASCADE;
DROP TYPE IF EXISTS public."notification_channel" CASCADE;
DROP EXTENSION IF EXISTS btree_gist CASCADE;
DROP TABLE IF EXISTS public.__f3_acl_platform_canary_20260915 CASCADE;
DROP SEQUENCE IF EXISTS public.__f3_acl_platform_canary_20260915_id_seq CASCADE;

-- Migration-history predicates from F12 tip PREASSIGNED (version + name)
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260913173000' AND (name = 'f3_bounded_financial_epoch_foundation' OR name IS NULL OR name = ''); -- 00118_f3_bounded_financial_epoch_foundation.sql
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260913173001' AND (name = 'f3_01_core_ledger_foundation' OR name IS NULL OR name = ''); -- 00119_f3_01_core_ledger_foundation.sql
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260913173002' AND (name = 'f3_02_secure_posting_idempotency' OR name IS NULL OR name = ''); -- 00120_f3_02_secure_posting_idempotency.sql
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260913173003' AND (name = 'f3_03_projection_read_proof' OR name IS NULL OR name = ''); -- 00121_f3_03_projection_read_proof.sql
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260913173004' AND (name = 'f3_04_correction_reversal' OR name IS NULL OR name = ''); -- 00122_f3_04_correction_reversal.sql
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260913173005' AND (name = 'f3_05_opening_cash_command' OR name IS NULL OR name = ''); -- 00123_f3_05_opening_cash_command.sql

SELECT 'qualification_reset_complete_PROPOSED_ONLY'::text AS reset_status;
COMMIT;

