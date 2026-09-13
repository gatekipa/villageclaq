/**
 * Disclosed disposable Management API floor.
 *
 * LIMITATION (do not hide): this is NOT a clean 00001–00117 replay.
 * Installed components only:
 *   1) prerequisite stub (groups/memberships/auth roles)
 *   2) live HGP / enqueue / Cut 2 queue pins
 *   3) real 00117 bytes via Management API file-stream apply
 *   4) later 00118+ frozen bytes (not part of floor prep)
 *
 * Never targets production. Never changes 00118–00123 SQL bytes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CUT2_QUEUE_SLICE_SQL,
  REGRESSION_SLICE_SQL,
  STUB_CORE_SQL,
} from "../fixtures/f3-forward-prerequisites.mjs";
import {
  extractEnqueueCreateSql,
  extractHasGroupPermissionCreateSql,
} from "../_m2_apply_disposable_floor.mjs";
import {
  APPROVED_DISPOSABLE_PROJECT_REF,
  applyRemoteManagementApiMigrationFromFile,
  assertRemoteManagementApiGates,
  queryRemoteDisposableDatabase,
  sha256Text,
  verifyRemoteProjectIdentity,
} from "./f3-management-api-remote-harness.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));

export const F3_FORWARD_FILES = Object.freeze([
  "00118_f3_bounded_financial_epoch_foundation.sql",
  "00119_f3_01_core_ledger_foundation.sql",
  "00120_f3_02_secure_posting_idempotency.sql",
  "00121_f3_03_projection_read_proof.sql",
  "00122_f3_04_correction_reversal.sql",
  "00123_f3_05_opening_cash_command.sql",
]);

export const FROZEN_DIGESTS = Object.freeze({
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

export const FILE_00117 = "00117_m2_notification_policy_foundation.sql";

export const FLOOR_LIMITATION =
  "DISCLOSED LIMITATION: disposable floor is NOT a clean 00001–00117 replay. Only prerequisite stub + live pins + real 00117 + exact frozen 00118+ bytes are in scope. Historical 00001–00116 files are NOT applied.";

export const DISCLOSED_FLOOR_COMPONENTS = Object.freeze([
  "prerequisite_stub",
  "live_hgp_enqueue_queue_pins",
  "real_00117",
  "frozen_00118_00123_bytes_not_installed_by_floor",
]);

export function remoteFloorOwnershipAndAclSql() {
  return `
ALTER FUNCTION public.has_group_permission(uuid, text, uuid) OWNER TO postgres;
ALTER FUNCTION public.enqueue_outbound_notification(text, uuid, public.notification_channel, uuid, text) OWNER TO postgres;
ALTER TABLE public.notifications_queue OWNER TO postgres;
SET ROLE postgres;
REVOKE ALL ON FUNCTION public.has_group_permission(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_group_permission(uuid, text, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.enqueue_outbound_notification(text, uuid, public.notification_channel, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_outbound_notification(text, uuid, public.notification_channel, uuid, text)
  TO service_role;
REVOKE ALL ON TABLE public.notifications_queue FROM PUBLIC;
REVOKE ALL ON TABLE public.notifications_queue FROM anon;
REVOKE ALL ON TABLE public.notifications_queue FROM authenticated;
REVOKE ALL ON TABLE public.notifications_queue FROM service_role;
GRANT SELECT ON TABLE public.notifications_queue TO authenticated;
GRANT SELECT ON TABLE public.notifications_queue TO service_role;
GRANT UPDATE (status, error_message, attempts, sent_at, data)
  ON TABLE public.notifications_queue TO service_role;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ubuntu') THEN
    REVOKE ALL ON FUNCTION public.has_group_permission(uuid, text, uuid) FROM ubuntu;
    REVOKE ALL ON FUNCTION public.enqueue_outbound_notification(text, uuid, public.notification_channel, uuid, text) FROM ubuntu;
    REVOKE ALL ON TABLE public.notifications_queue FROM ubuntu;
  END IF;
END $$;
RESET ROLE;
`;
}

export function disclosedFloorSqlSteps() {
  return [
    { id: "prerequisite_stub", sql: STUB_CORE_SQL },
    { id: "regression_slice", sql: REGRESSION_SLICE_SQL },
    { id: "cut2_queue_slice", sql: CUT2_QUEUE_SLICE_SQL },
    {
      id: "live_pins_functions",
      sql: `${extractHasGroupPermissionCreateSql()}\n${extractEnqueueCreateSql()}\n`,
    },
    { id: "live_pins_acl", sql: remoteFloorOwnershipAndAclSql() },
  ];
}

export function assertFrozenDigestsOnDisk() {
  const dir = path.join(root, "supabase/migrations");
  const observed = {};
  for (const [file, digest] of Object.entries(FROZEN_DIGESTS)) {
    const bytes = fs.readFileSync(path.join(dir, file), "utf8");
    const actual = sha256Text(bytes);
    if (actual !== digest) {
      throw new Error(`FROZEN DIGEST DRIFT ${file}: ${actual} !== ${digest}`);
    }
    observed[file] = actual;
  }
  return observed;
}

export async function installDisclosedDisposableFloor({
  apply00117 = true,
  projectRef = APPROVED_DISPOSABLE_PROJECT_REF,
} = {}) {
  assertRemoteManagementApiGates({ projectRef, optIn: true });
  const digests = assertFrozenDigestsOnDisk();
  const identity = await verifyRemoteProjectIdentity({ projectRef });
  const steps = [];
  for (const step of disclosedFloorSqlSteps()) {
    const result = await queryRemoteDisposableDatabase({
      query: step.sql,
      projectRef,
      skipIdentity: true,
    });
    steps.push({
      id: step.id,
      ok: result.ok,
      status: result.status,
      capture: result.capture,
    });
    if (!result.ok) {
      return {
        ok: false,
        limitation: FLOOR_LIMITATION,
        components: [...DISCLOSED_FLOOR_COMPONENTS],
        identity,
        digests,
        steps,
        applied00117: false,
        cleanReplay00001_00117: false,
      };
    }
  }

  let applied00117 = false;
  let apply00117Result = null;
  if (apply00117) {
    const fileAbsPath = path.join(root, "supabase/migrations", FILE_00117);
    apply00117Result = await applyRemoteManagementApiMigrationFromFile({
      fileAbsPath,
      name: "m2_notification_policy_foundation",
      projectRef,
      optIn: true,
    });
    applied00117 = Boolean(apply00117Result.ok);
    steps.push({
      id: "real_00117_file_stream",
      ok: apply00117Result.ok,
      status: apply00117Result.status,
      capture: apply00117Result.capture,
    });
  }

  return {
    ok: steps.every((s) => s.ok),
    limitation: FLOOR_LIMITATION,
    components: [...DISCLOSED_FLOOR_COMPONENTS],
    identity,
    digests,
    steps,
    applied00117,
    apply00117Result,
    cleanReplay00001_00117: false,
  };
}
