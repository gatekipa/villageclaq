/**
 * Pins for the supabase db push (CLI 2.117.0) qualification candidate.
 *
 * Management API POST /database/migrations {query,name} is PERMANENTLY
 * DISQUALIFIED as VillageClaq’s production migration runner (Chief live
 * probe 2026-09-13: SQL committed, history INSERT failed, version
 * unrecoverable). db push is a qualification CANDIDATE only until
 * Daybreak approves. This module does not authorize production apply.
 *
 * Never print, log, commit, or put the DB password on argv as `-p`.
 */
export const CLI_PIN = "2.117.0";

export const APPROVED_DISPOSABLE_PROJECT_REF = "jkorwnwwmdeflfntxntl";
export const APPROVED_DISPOSABLE_PROJECT_REFS = Object.freeze([
  APPROVED_DISPOSABLE_PROJECT_REF,
]);
export const APPROVED_DISPOSABLE_PROJECT_NAME =
  "villageclaq-f3-management-api-disposable-20260913";
export const APPROVED_DISPOSABLE_ORG_ID = "eyztkzkprpmlmcabrfef";
export const APPROVED_DISPOSABLE_HOST = "db.jkorwnwwmdeflfntxntl.supabase.co";
export const APPROVED_DISPOSABLE_PORT = 5432;
export const APPROVED_DISPOSABLE_DATABASE = "postgres";
export const APPROVED_DISPOSABLE_USER = "postgres";

/**
 * Chief live preflight 2026-09-13: identity host stays the project DB
 * hostname for gates. Direct `db.{ref}.supabase.co:5432` failed
 * (AAAA/IPv6 unreachable). Session-mode pooler on :5432 succeeded.
 * Transaction pooler :6543 is never a db-push target (DDL).
 */
export const APPROVED_DISPOSABLE_POOLER_HOST = "aws-0-us-east-1.pooler.supabase.com";
export const APPROVED_DISPOSABLE_POOLER_PORT = 5432;
export const APPROVED_DISPOSABLE_POOLER_USER = `postgres.${APPROVED_DISPOSABLE_PROJECT_REF}`;
export const TRANSACTION_POOLER_PORT = 6543;
export const DIRECT_DB_HOST_IPV6_LIMITATION =
  "Direct db.jkorwnwwmdeflfntxntl.supabase.co:5432 failed from Chief live preflight (AAAA/IPv6 unreachable). Candidate --db-url uses session-mode pooler aws-0-us-east-1.pooler.supabase.com:5432 user postgres.jkorwnwwmdeflfntxntl. Identity gates still require exact project ref/name/org/host. Production forever denied.";

export const DBPUSH_SENTINEL = "villageclaq-f3-dbpush-20260913-authorized";
export const DBPUSH_SENTINEL_ENV = "F3_DBPUSH_DISPOSABLE_SENTINEL";
export const DB_PASSWORD_ENV = "VILLAGECLAQ_F3_DISPOSABLE_DB_PASSWORD";
export const MGMT_TOKEN_ENV = "VILLAGECLAQ_F3_DISPOSABLE_MGMT_TOKEN";
export const DESTRUCTIVE_ENV = "F3_REMOTE_DESTRUCTIVE_TEST";
export const DESTRUCTIVE_VALUE = "1";

export const PRODUCTION_REF = "llbnliixczcqfftxpsmb";
export const PRODUCTION_HISTORY_CEILING_VERSION = "20260912174049";

export const MANAGEMENT_API_APPLY_PERMANENTLY_DISQUALIFIED = true;
export const MANAGEMENT_API_APPLY_DISQUALIFICATION =
  "PERMANENTLY DISQUALIFIED: Management API POST /database/migrations {query,name} — SQL can COMMIT while history INSERT fails with no recoverable version (Chief live probe 2026-09-13 on jkorwnwwmdeflfntxntl).";

export const DB_PUSH_CANDIDATE_STATUS =
  "QUALIFICATION CANDIDATE ONLY — supabase db push CLI 2.117.0 is not production-approved until Daybreak approves";

export const FILE_BASED_RUNNER_VERDICTS = Object.freeze({
  PASS: "FILE-BASED RUNNER QUALIFICATION PASS",
  QUALIFICATION_PASS: "FILE-BASED RUNNER QUALIFICATION PASS — STUB/LIVE-PIN FLOOR LIMITATION",
  MECHANICS_PASS: "FILE-BASED RUNNER MECHANICS PASS — STUB/LIVE-PIN QUALIFICATION FLOOR",
  MECHANICS_PASS_SUPERSEDED: true,
  HOLD: "HOLD",
  BLOCKED: "BLOCKED",
});

/** Prior hosted MECHANICS PASS is SUPERSEDED (docs only; do not erase). */
export const SUPERSEDED_MECHANICS_PASS_CLAIM = Object.freeze({
  label: "FILE-BASED RUNNER MECHANICS PASS — STUB/LIVE-PIN QUALIFICATION FLOOR",
  status: "SUPERSEDED",
  reason: [
    "commands were exercised",
    "00118 hit intended history-failure",
    "00119/20 failed on missing role ubuntu",
    "00121-23 cascading F3_ABORT",
    "repairing after SQL failures was NOT qualified recovery",
    "history alignment is not object install",
    "repair-safety gate and F3 install were NOT qualified",
  ],
});

export const F3_FORWARD_FILES = Object.freeze([
  "00118_f3_bounded_financial_epoch_foundation.sql",
  "00119_f3_01_core_ledger_foundation.sql",
  "00120_f3_02_secure_posting_idempotency.sql",
  "00121_f3_03_projection_read_proof.sql",
  "00122_f3_04_correction_reversal.sql",
  "00123_f3_05_opening_cash_command.sql",
]);

/** Superseded 2026-09-13 ACL-portability pin (unconditional ubuntu REVOKE). */
export const SUPERSEDED_FROZEN_DIGESTS = Object.freeze({
  "00118_f3_bounded_financial_epoch_foundation.sql":
    "517774fd883ecc8c8ba7d2e287c7245a1289b21623c839f594b0801611968f3c",
  "00119_f3_01_core_ledger_foundation.sql":
    "9b09a733ed848e2a88a894db0815bd0f33f86335b58f7c9cd58845b6607d785d",
  "00120_f3_02_secure_posting_idempotency.sql":
    "4b870418ea15160a7aec0e6df707d9c8a3afc435f2d8bd1c861e0af7c47eb505",
  "00121_f3_03_projection_read_proof.sql":
    "568ae0b15b1b6e6c0a7effd9e9b5644a294cc22d76dbbf0e6714a28888825cf5",
  "00122_f3_04_correction_reversal.sql":
    "fd2c6e8729d1c7983421804b5f028edd16170c9f9056c8db2f3994f4dff8bdf9",
  "00123_f3_05_opening_cash_command.sql":
    "848b7cbe7e4e20e2e284d88f9954be0be8ffdfe4fc6d7c649e536d0c09aab699",
});

/** Founder-authorized candidate bytes after optional-ubuntu ACL portability. */
export const FROZEN_DIGESTS = Object.freeze({
  "00118_f3_bounded_financial_epoch_foundation.sql":
    "bb823ebdddcefba7774f3347a609a05393d9a67c9430d0bd925c3458eaf5efed",
  "00119_f3_01_core_ledger_foundation.sql":
    "b22e16783fbb429ccae0ce15291d83311861f4e873cd01363bbd630372633f11",
  "00120_f3_02_secure_posting_idempotency.sql":
    "d81c8f52d4fccea4b654c3a54806ffc07d654ffa2a33540c97b74721d56b9a60",
  "00121_f3_03_projection_read_proof.sql":
    "51f40ccbd7dad79362b8cf2cd9854b9c8cdfd7295e4c10be5892d953915e90ce",
  "00122_f3_04_correction_reversal.sql":
    "84f52b89b764a468db7748e5c572f2543c5d466e5369ff36e6889d85ca8434f3",
  "00123_f3_05_opening_cash_command.sql":
    "0c8af9d755e5329ca58d6c5ae967fbe5b18e3e41bb836c934cfea0c06afce96d",
});

/** Filename versions known BEFORE any db push execution. Never guessed / clocked. */
export const PREASSIGNED_VERSIONS = Object.freeze({
  "00118_f3_bounded_financial_epoch_foundation.sql": "20260913173000",
  "00119_f3_01_core_ledger_foundation.sql": "20260913173001",
  "00120_f3_02_secure_posting_idempotency.sql": "20260913173002",
  "00121_f3_03_projection_read_proof.sql": "20260913173003",
  "00122_f3_04_correction_reversal.sql": "20260913173004",
  "00123_f3_05_opening_cash_command.sql": "20260913173005",
});

export const PREASSIGNED_NAMES = Object.freeze({
  "00118_f3_bounded_financial_epoch_foundation.sql": "f3_bounded_financial_epoch_foundation",
  "00119_f3_01_core_ledger_foundation.sql": "f3_01_core_ledger_foundation",
  "00120_f3_02_secure_posting_idempotency.sql": "f3_02_secure_posting_idempotency",
  "00121_f3_03_projection_read_proof.sql": "f3_03_projection_read_proof",
  "00122_f3_04_correction_reversal.sql": "f3_04_correction_reversal",
  "00123_f3_05_opening_cash_command.sql": "f3_05_opening_cash_command",
});

export const RECOGNITION_ALLOWLIST = Object.freeze(["manual_income"]);

export const LIVE_PROBE_THROWAWAY_TABLE = "public.f3_mapi_throwaway_probe";

export const HISTORY_INJECT_MARKER = "F3_DBPUSH_DISPOSABLE_HISTORY_INJECT";

export const TARGET_OBJECT_PROBES = Object.freeze({
  "00118_f3_bounded_financial_epoch_foundation.sql": Object.freeze([
    "to_regnamespace('financial_private')",
    "to_regclass('public.financial_ledger_epochs')",
  ]),
  "00119_f3_01_core_ledger_foundation.sql": Object.freeze([
    "to_regnamespace('financial_core')",
    "to_regclass('public.financial_accounts')",
    "to_regclass('public.financial_events')",
    "to_regclass('public.financial_postings')",
    "to_regtype('public.financial_event_class')",
  ]),
  "00120_f3_02_secure_posting_idempotency.sql": Object.freeze([
    "to_regprocedure('public.post_financial_command(jsonb)')",
  ]),
  "00121_f3_03_projection_read_proof.sql": Object.freeze([
    "to_regprocedure('public.get_financial_projection_bundle(uuid,timestamptz,timestamptz,timestamptz)')",
    "to_regprocedure('public.get_financial_cashbook(uuid,timestamptz,timestamptz,uuid,text,integer,integer)')",
  ]),
  "00122_f3_04_correction_reversal.sql": Object.freeze([
    "to_regprocedure('public.correct_financial_event(jsonb)')",
  ]),
  "00123_f3_05_opening_cash_command.sql": Object.freeze([
    "to_regprocedure('public.post_financial_opening_cash(jsonb)')",
  ]),
});
