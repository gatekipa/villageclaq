import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

function loadExport(file, exportNames) {
  let source = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  source = source.replace(/^import[^;]+;\s*$/gm, "");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("exports", "module", "require", compiled)(loaded.exports, loaded, () => ({}));
  return Object.fromEntries(exportNames.map((name) => [name, loaded.exports[name]]));
}

const { classifyAfricasTalkingRecipient } = loadExport(
  "src/lib/notifications/sms-sender.ts",
  ["classifyAfricasTalkingRecipient"],
);
const recheckSource = fs.readFileSync(
  new URL("../src/lib/payment-reminder-delivery-recheck.ts", import.meta.url),
  "utf8",
);
const drainSource = fs.readFileSync(
  new URL("../src/app/api/cron/drain-notification-queue/route.ts", import.meta.url),
  "utf8",
);

test("Africa's Talking accepts only status 101 with a message id", () => {
  assert.deepEqual(classifyAfricasTalkingRecipient({ statusCode: 101, status: "Success", messageId: "m-1" }), {
    sent: true,
    queued: false,
    messageId: "m-1",
  });
  assert.equal(classifyAfricasTalkingRecipient({ statusCode: 401, status: "Rejected", messageId: "m-2" }).sent, false);
  assert.match(classifyAfricasTalkingRecipient({ statusCode: 401, status: "Rejected", messageId: "m-2" }).error, /RECIPIENT_REJECTED/);
  assert.equal(classifyAfricasTalkingRecipient({ statusCode: 101, status: "Success" }).sent, false);
  assert.equal(classifyAfricasTalkingRecipient(undefined).sent, false);
});

test("reminder database errors are retryable while missing or ineligible records are terminal", () => {
  assert.match(recheckSource, /obligation_lookup_failed", retryable: true/);
  assert.match(recheckSource, /related_lookup_failed", retryable: true/);
  assert.match(recheckSource, /confirmed_balance_lookup_failed", retryable: true/);
  assert.match(recheckSource, /obligation_not_found", retryable: false/);
  assert.match(recheckSource, /related_record_not_found", retryable: false/);
  assert.match(drainSource, /if \(recheck\.retryable\)[\s\S]*PAYMENT_REMINDER_RECHECK_FAILED/);
  assert.ok(
    drainSource.indexOf("if (recheck.retryable)") < drainSource.indexOf('supabase.rpc("skip_notification_delivery"'),
    "retryable read failures must enter failed settlement before terminal skip",
  );
});
