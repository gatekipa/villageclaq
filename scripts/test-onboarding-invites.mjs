import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Guardrails for the onboarding invite step (Track A2): per-row email/phone
// mode with a real PhoneInput, up-front validation BEFORE any group rows are
// created, type-driven submit mapping (no includes("@") guessing), and
// rule-11 logging hygiene (no empty catch, no raw recipient values in logs).
// Static guarantees — the repo has no component-render harness, so behavior
// is pinned by asserting source clause presence/absence/ordering.

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const PAGE = "src/app/[locale]/(dashboard)/dashboard/onboarding/group/page.tsx";

const NEW_ONBOARDING_KEYS = [
  "inviteTypeEmail",
  "inviteTypePhone",
  "inviteEmailPlaceholder",
  "invalidInviteEmail",
  "invalidInvitePhone",
];

test("invite rows carry an explicit email/phone mode and the invite step renders PhoneInput", () => {
  const page = read(PAGE);
  // The row model is typed, not guessed from the value shape.
  assert.match(page, /type:\s*"email"\s*\|\s*"phone"/, "InviteRow must declare the email|phone mode union");
  // PhoneInput must render INSIDE the invite step (after its render marker).
  const inviteMarkerAt = page.indexOf('currentStepKey === "invite"');
  assert.ok(inviteMarkerAt > 0, "invite step render marker must exist");
  const phoneInputAt = page.indexOf("<PhoneInput", inviteMarkerAt);
  assert.ok(phoneInputAt > inviteMarkerAt, "PhoneInput must render within the invite step");
  // The phone row feeds PhoneInput's full +<cc><digits> string straight back.
  assert.match(page, /onChange=\{\(p\) => updateInvite\(row\.id, p\)\}/, "PhoneInput must write the full phone string into the row");
});

test('the includes("@") email-vs-phone classification is gone; submit maps from row.type', () => {
  const page = read(PAGE);
  assert.ok(!page.includes('.value.includes("@")'), 'no invite row may be classified via includes("@")');
  // Email rows: trimmed + lowercased (consistent with 00095 matching).
  assert.match(page, /email:\s*inv\.type === "email"\s*\?\s*inv\.value\.trim\(\)\.toLowerCase\(\)\s*:\s*null/, "email rows must map to normalized email");
  // Phone rows: the PhoneInput full string as-is.
  assert.match(page, /phone:\s*inv\.type === "phone"\s*\?\s*inv\.value\s*:\s*null/, "phone rows must map to the PhoneInput full string");
});

test("invite validation references formatPhoneForWhatsApp and runs BEFORE any group creation", () => {
  const page = read(PAGE);
  assert.match(page, /import \{ formatPhoneForWhatsApp \} from "@\/lib\/format-phone-whatsapp"/, "must import the client-safe phone formatter");
  const finishAt = page.indexOf("async function handleFinish");
  assert.ok(finishAt > 0, "handleFinish must exist");
  const phoneCheckAt = page.indexOf("formatPhoneForWhatsApp(", finishAt);
  const emailCheckAt = page.indexOf("EMAIL_PATTERN.test(", finishAt);
  const orgInsertAt = page.indexOf('.from("organizations")', finishAt);
  const groupInsertAt = page.indexOf('.from("groups")', finishAt);
  assert.ok(phoneCheckAt > finishAt, "handleFinish must validate phone rows via formatPhoneForWhatsApp");
  assert.ok(emailCheckAt > finishAt, "handleFinish must validate email rows");
  assert.ok(orgInsertAt > 0 && groupInsertAt > 0, "org/group creation must exist in handleFinish");
  assert.ok(phoneCheckAt < orgInsertAt && phoneCheckAt < groupInsertAt, "phone validation must precede group creation");
  assert.ok(emailCheckAt < orgInsertAt && emailCheckAt < groupInsertAt, "email validation must precede group creation");
  // Failure path aborts via the new i18n keys.
  assert.match(page, /setError\(t\("invalidInviteEmail"\)\)/);
  assert.match(page, /setError\(t\("invalidInvitePhone"\)\)/);
});

test("the invitation bulk insert captures its error and warns without recipient values", () => {
  const page = read(PAGE);
  assert.match(page, /error:\s*inviteErr\s*\}/, "the invitations insert must destructure its error");
  assert.match(page, /\[Onboarding\] invitation insert failed/, "insert failures must be warned with context");
  assert.match(page, /23505/, "duplicate inserts (23505) must take the warn path with a duplicate note");
});

test("all new i18n keys exist in BOTH locales (onboarding + invitations namespaces)", () => {
  for (const localeFile of ["messages/en.json", "messages/fr.json"]) {
    const json = JSON.parse(read(localeFile));
    for (const key of NEW_ONBOARDING_KEYS) {
      assert.equal(typeof json.onboarding?.[key], "string", `${localeFile}: onboarding.${key} must exist`);
      assert.ok(json.onboarding[key].length > 0, `${localeFile}: onboarding.${key} must be non-empty`);
    }
    assert.equal(typeof json.invitations?.duplicateInviteError, "string", `${localeFile}: invitations.duplicateInviteError must exist`);
    assert.ok(json.invitations.duplicateInviteError.length > 0, `${localeFile}: invitations.duplicateInviteError must be non-empty`);
  }
});

test("no empty .catch(() => {}) remains anywhere in the onboarding page", () => {
  const page = read(PAGE);
  assert.ok(!page.includes(".catch(() => {})"), "rule 11: every .catch must console.warn with context");
});

test("no console call interpolates a raw invite value (row.value / inv.value)", () => {
  const page = read(PAGE);
  // Scan each console.* argument list (up to the statement-ending semicolon)
  // for raw recipient values. [^;] spans newlines, covering multi-line calls.
  assert.doesNotMatch(
    page,
    /console\.(?:log|warn|error)\([^;]*\b(?:row|inv)\.value/,
    "console output must never include a raw email/phone value"
  );
});

test("invite validation dedupes intra-form duplicates BEFORE the atomic multi-row insert", () => {
  const page = read(PAGE);
  // One duplicate row would abort the entire multi-row INSERT (00029 email
  // / 00099 phone unique indexes), silently dropping every invite — so the
  // validation loop must reject duplicates up-front with a friendly error.
  assert.match(page, /const seenInvites = new Set<string>\(\);/);
  assert.ok(page.includes("`email:${value.toLowerCase()}`"), "email dedupe key must normalize case");
  assert.ok(page.includes('`phone:${value.replace(/\\D/g, "")}`'), "phone dedupe key must normalize to digits");
  assert.match(page, /setError\(t\("duplicateInviteRow"\)\);/);
  // The dedupe must run inside handleFinish before the groups insert.
  const dedupeAt = page.indexOf("seenInvites");
  const groupInsertAt = page.indexOf('from("groups")');
  assert.ok(dedupeAt > 0 && groupInsertAt > 0 && dedupeAt < groupInsertAt, "dedupe must precede group creation");
});

test("invitation emails are gated on the insert having succeeded (no ghost invites)", () => {
  const page = read(PAGE);
  // Build 3 renamed the insert-failure flag from `inviteErr` to
  // `inviteInsertFailed` while making the email leg await + check delivery.
  // Whitespace-tolerant: assert the semantics (email list gated on the
  // insert-failure flag), not the exact layout.
  assert.match(
    page,
    /emailInvites\s*=\s*inviteInsertFailed\s*\?\s*\[\]\s*:/,
    "the email leg must not send when zero invitation rows were created",
  );
});

test("duplicateInviteRow key exists in both locales", () => {
  for (const localeFile of ["messages/en.json", "messages/fr.json"]) {
    const json = JSON.parse(read(localeFile));
    assert.equal(typeof json.onboarding?.duplicateInviteRow, "string", `${localeFile}: onboarding.duplicateInviteRow must exist`);
    assert.ok(json.onboarding.duplicateInviteRow.length > 0);
  }
});
