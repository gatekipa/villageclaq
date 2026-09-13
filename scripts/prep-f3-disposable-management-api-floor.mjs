/**
 * Chief-runnable disclosed floor install for the founder-authorized
 * disposable Management API project. Does NOT replay 00001–00116.
 * Does NOT apply 00118+. Does NOT target production.
 *
 * Requires:
 *   VILLAGECLAQ_F3_DISPOSABLE_MGMT_TOKEN
 *   F3_DISPOSABLE_MAPI_SENTINEL=villageclaq-f3-mapi-20260913-authorized
 *   F3_REMOTE_DESTRUCTIVE_TEST=1
 */
import { APPROVED_DISPOSABLE_PROJECT_REF, REMOTE_MANAGEMENT_API_STATUS } from "./lib/f3-management-api-remote-harness.mjs";
import {
  FLOOR_LIMITATION,
  installDisclosedDisposableFloor,
} from "./lib/f3-management-api-disposable-floor.mjs";

function mainUnavailable() {
  console.log(
    JSON.stringify(
      {
        ok: false,
        status: "NOT_RUN",
        reason: REMOTE_MANAGEMENT_API_STATUS,
        limitation: FLOOR_LIMITATION,
        projectRef: APPROVED_DISPOSABLE_PROJECT_REF,
      },
      null,
      2,
    ),
  );
  process.exit(2);
}

const required = [
  "VILLAGECLAQ_F3_DISPOSABLE_MGMT_TOKEN",
  "F3_DISPOSABLE_MAPI_SENTINEL",
  "F3_REMOTE_DESTRUCTIVE_TEST",
];
if (required.some((key) => !process.env[key])) {
  mainUnavailable();
}

const result = await installDisclosedDisposableFloor({ apply00117: true });
const publicResult = {
  ok: result.ok,
  limitation: result.limitation,
  components: result.components,
  cleanReplay00001_00117: result.cleanReplay00001_00117,
  applied00117: result.applied00117,
  steps: result.steps.map((s) => ({ id: s.id, ok: s.ok, status: s.status })),
  identity: { ref: APPROVED_DISPOSABLE_PROJECT_REF, nameVerified: Boolean(result.identity?.ok) },
};
console.log(JSON.stringify(publicResult, null, 2));
process.exit(result.ok ? 0 : 1);
