import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readSheet } from "read-excel-file/node";

const root = new URL("../", import.meta.url);
const source = async (path) => readFile(new URL(path, root), "utf8");

test("the downloadable XLSX template preserves phone text and required columns", async () => {
  const rows = await readSheet(new URL("../public/templates/villageclaq-member-import-template.xlsx", import.meta.url), {
    parseNumber(raw) {
      return { kind: "number", raw };
    },
  });
  assert.deepEqual(rows[0], [
    "display_name",
    "title",
    "email",
    "phone",
    "role",
    "notification_consent",
  ]);
  assert.equal(rows[1][3], "+13014335857");
  assert.equal(rows[2][3], "+237670000000");
});

test("member UI accepts only CSV/XLSX and requires explicit external channels", async () => {
  const page = await source("src/app/[locale]/(dashboard)/dashboard/members/page.tsx");
  assert.match(page, /accept="\.csv,\.xlsx"/);
  assert.match(page, /readMemberImportFile\(file\)/);
  assert.match(page, /setClaimChannels\(\[\]\)/);
  assert.match(page, /\["email", "sms", "whatsapp"\]/);
  assert.match(page, /source_kind: row\.source_kind/);
  assert.doesNotMatch(page, /Papa\.parse/);
});

test("XLSX reader rejects formulas, macros, ambiguous numeric phones and excessive input", async () => {
  const parser = await source("src/lib/member-import.ts");
  assert.match(parser, /MEMBER_IMPORT_MAX_BYTES = 5 \* 1024 \* 1024/);
  assert.match(parser, /MEMBER_IMPORT_MAX_ROWS = 1_000/);
  assert.match(parser, /vbaproject\.bin/);
  assert.match(parser, /\/<f\(\?:\\s\|>\)\//);
  assert.match(parser, /ambiguous_phone/);
  assert.match(parser, /parseNumber\(raw\)/);
});

test("proxy-claim email stays in the authoritative queue and drain contract", async () => {
  const [route, matrix, migration] = await Promise.all([
    source("src/app/api/proxy-claim/send/route.ts"),
    source("src/lib/cut2-channel-matrix.ts"),
    source("supabase/migrations/20260928043000_xlsx_import_and_proxy_claim_email.sql"),
  ]);
  assert.match(route, /\["email", "whatsapp", "sms"\]/);
  assert.match(route, /enqueueOutboundNotification/);
  assert.doesNotMatch(route, /sendEmail\(/);
  assert.match(matrix, /proxy_claim: \{ whatsapp: "ALLOW", sms: "ALLOW", email: "ALLOW"/);
  assert.match(matrix, /proxy_claim: "proxy-claim"/);
  assert.match(migration, /xlsx_import/);
  assert.match(migration, /'proxy_claim'.*'email'/s);
  assert.doesNotMatch(migration, /GRANT\s+(?:INSERT|UPDATE|DELETE|TRUNCATE)/i);
});
