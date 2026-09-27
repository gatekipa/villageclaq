import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const drain = read("src/app/api/cron/drain-notification-queue/route.ts");
const reminderControls = read("supabase/migrations/00201_payment_reminder_controls.sql");

test("founder delivery suppression is recorded as a terminal skipped outcome", () => {
  assert.match(drain, /FOUNDER_DELIVERY_SUPPRESSED\s*=\s*"founder_test_external_delivery_suppressed"/);
  assert.match(
    drain,
    /errorMsg === FOUNDER_DELIVERY_SUPPRESSED[\s\S]*skip_notification_delivery[\s\S]*skipped\+\+[\s\S]*continue/,
  );
  assert.match(reminderControls, /CREATE OR REPLACE FUNCTION public\.skip_notification_delivery/);
  assert.match(reminderControls, /SET status = 'dead_letter'/);
  assert.match(reminderControls, /next_retry_at = NULL/);
  assert.match(reminderControls, /sent_at = NULL/);
});

test("actual provider failures remain on the bounded retry settlement path", () => {
  assert.match(
    drain,
    /settle_notification_delivery[\s\S]*success:\s*false[\s\S]*error_message:\s*errorMsg/,
  );
  assert.ok(
    drain.indexOf("errorMsg === FOUNDER_DELIVERY_SUPPRESSED") <
      drain.lastIndexOf('supabase.rpc("settle_notification_delivery"'),
    "suppression branch must precede the ordinary failure settlement",
  );
});
