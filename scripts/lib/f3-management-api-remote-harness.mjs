/**
 * Remote Management API harness — SEPARATE from local-only helpers.
 *
 * Official contract (do not invent):
 *   POST /v1/projects/{ref}/database/migrations
 *   body accepts ONLY: query (required), name (optional), rollback (optional)
 *   It does NOT accept a caller-selected timestamp/version.
 *   Docs: https://supabase.com/docs/reference/api/v1-apply-a-migration
 *
 * This module is gated and unimplemented until the founder provides an
 * approved disposable project ref + credentials + sentinel.
 * Production ref `llbnliixczcqfftxpsmb` is never accepted.
 * No hosted POST is attempted from this module.
 */
export const REMOTE_MANAGEMENT_API_STATUS =
  "BLOCKED — DISPOSABLE PROJECT AUTHORIZATION REQUIRED";

export const APPROVED_DISPOSABLE_PROJECT_REFS = Object.freeze([]);
export const APPROVED_DISPOSABLE_SENTINEL = null;

export const MANAGEMENT_API_APPLY_PATH = "/v1/projects/{ref}/database/migrations";
export const MANAGEMENT_API_APPLY_BODY_FIELDS = Object.freeze(["query", "name", "rollback"]);
export const MANAGEMENT_API_ACCEPTS_CALLER_VERSION = false;

const PRODUCTION_REF = "llbnliixczcqfftxpsmb";

export function assertRemoteManagementApiAuthorized({
  projectRef,
  sentinel,
  optIn,
} = {}) {
  if (String(projectRef || "") === PRODUCTION_REF) {
    const err = new Error("REFUSE: production project ref is never a disposable Management API target");
    err.code = "F3_REMOTE_PRODUCTION_REFUSED";
    throw err;
  }
  const err = new Error(REMOTE_MANAGEMENT_API_STATUS);
  err.code = "F3_REMOTE_MANAGEMENT_API_BLOCKED";
  err.details = {
    approvedRefs: APPROVED_DISPOSABLE_PROJECT_REFS,
    approvedSentinelPresent: Boolean(APPROVED_DISPOSABLE_SENTINEL),
    callerRef: projectRef || null,
    callerSentinelPresent: Boolean(sentinel),
    optIn: Boolean(optIn),
    implemented: false,
  };
  throw err;
}

export function applyRemoteManagementApiMigration() {
  assertRemoteManagementApiAuthorized();
}

export function listRemoteManagementApiMigrations() {
  assertRemoteManagementApiAuthorized();
}
