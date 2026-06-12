import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Guardrails for the onboarding first-run polish lane:
//   1. Force-refresh plumbing in GroupProvider — the wizard's success path
//      must bypass the 5s cooldown / in-flight guard so the brand-new owner
//      is never bounced BACK to onboarding with memberships=[] (the
//      post-creation race). The cooldown must stay intact for every
//      non-forced caller (it exists because of a 331-req/min production
//      incident — CLAUDE.md rules 9/10).
//   2. handleProfileSave (Step 1 Next) — try/catch, localized inline error,
//      saving state that disables the button. No raw Supabase text in UI.
//   3. Mobile step header — one-line "Step n of total" summary below sm:,
//      full label row sm:+ only.
//   4. PhoneCollectionDialog — no raw error.message in the UI; warn + i18n.
// Static guarantees — the repo has no component-render harness, so behavior
// is pinned by asserting source clause presence/absence/ordering.

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const CONTEXT = "src/lib/group-context.tsx";
const WIZARD = "src/app/[locale]/(dashboard)/dashboard/onboarding/group/page.tsx";
const LAYOUT = "src/app/[locale]/(dashboard)/layout.tsx";

/* ─────────────── 1. force-refresh plumbing (group-context) ─────────────── */

test("fetchData accepts a force flag that defaults to false", () => {
  const src = read(CONTEXT);
  assert.match(
    src,
    /const fetchData = useCallback\(async \(force: boolean = false\) =>/,
    "fetchData must take force: boolean = false so all existing callers stay non-forced",
  );
});

test("forced calls survive an in-flight fetch by WAITING then re-fetching (no early return)", () => {
  const src = read(CONTEXT);
  const guardAt = src.indexOf("if (fetchInProgress.current) {");
  assert.ok(guardAt > 0, "the in-flight guard block must exist");
  const block = src.slice(guardAt, src.indexOf("const now = Date.now()", guardAt));
  // Non-forced callers still return early — preserves the anti-flicker guard.
  assert.match(block, /if \(!force\) return;/, "non-forced in-flight calls must still return early");
  // Forced callers wait for the in-flight fetch, then fall through to a fresh one.
  assert.match(block, /while \(fetchInProgress\.current && Date\.now\(\) - waitStart < 10_000\)/, "forced calls must wait (bounded) for the in-flight fetch");
  assert.match(block, /await new Promise\(\(resolve\) => setTimeout\(resolve, 100\)\)/, "the wait must poll, not spin");
  // The wait block must NOT contain a bare `return` after the !force check —
  // a forced call that returns early is exactly the stale-data race.
  const afterForceCheck = block.slice(block.indexOf("if (!force) return;") + "if (!force) return;".length);
  assert.ok(!/\breturn\b/.test(afterForceCheck), "a forced call must never return early from the in-flight guard");
});

test("the 5s cooldown is preserved for non-forced calls and bypassed ONLY by force", () => {
  const src = read(CONTEXT);
  assert.match(
    src,
    /if \(!force && lastFetchTime\.current > 0 && now - lastFetchTime\.current < 5000\)/,
    "cooldown guard must remain, gated behind !force",
  );
});

test("fetchData keeps EMPTY useCallback deps (rule 9 — the 331-req/min incident class)", () => {
  const src = read(CONTEXT);
  const start = src.indexOf("const fetchData = useCallback");
  assert.ok(start > 0, "fetchData useCallback must exist");
  const end = src.indexOf("}, []);", start);
  assert.ok(end > start, "fetchData's useCallback must close with empty deps `}, []);`");
  // Strip comment lines — the file's own incident-history comments mention
  // searchParams legitimately; only CODE references are violations.
  const body = src
    .slice(start, end)
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  assert.ok(!body.includes("searchParams"), "fetchData must not close over searchParams (read via ref only)");
});

test("refresh exposes force?: boolean and coerces it strictly before delegating", () => {
  const src = read(CONTEXT);
  assert.match(
    src,
    /refresh: \(force\?: boolean\) => Promise<void>;/,
    "the context interface must expose refresh(force?: boolean)",
  );
  assert.match(
    src,
    /const refresh = useCallback\(async \(force\?: boolean\) =>/,
    "refresh must accept the optional force flag",
  );
  assert.match(
    src,
    /await fetchData\(force === true\);/,
    "refresh must coerce force strictly (guards against refresh passed as an event handler)",
  );
  // refresh must not flip loading=true (DashboardGuard unmount/remount flicker).
  const refreshAt = src.indexOf("const refresh = useCallback");
  const refreshEnd = src.indexOf("}, [fetchData]);", refreshAt);
  assert.ok(!src.slice(refreshAt, refreshEnd).includes("setLoading(true)"), "refresh must never set loading=true");
});

test("internal provider callers (initial effect + auth listener) stay non-forced", () => {
  const src = read(CONTEXT);
  assert.ok(!src.includes("fetchData(true)"), "no internal provider call may force-fetch — only refresh(true) callers opt in");
});

/* ─────────────── 2. wizard success path forces the refresh ─────────────── */

test("handleFinish awaits refresh(true) BEFORE navigating to /dashboard", () => {
  const page = read(WIZARD);
  const finishAt = page.indexOf("async function handleFinish");
  assert.ok(finishAt > 0, "handleFinish must exist");
  const forcedRefreshAt = page.indexOf("await refresh(true);", finishAt);
  const navAt = page.indexOf('router.push("/dashboard")', finishAt);
  assert.ok(forcedRefreshAt > finishAt, "handleFinish must call await refresh(true) — a plain refresh() no-ops under the cooldown and bounces the new owner back to onboarding");
  assert.ok(navAt > forcedRefreshAt, "the forced refresh must complete before router.push('/dashboard')");
});

/* ─────────────── 3. handleProfileSave hardening ─────────────── */

test("handleProfileSave wraps the save in try/catch and stays on the step on failure", () => {
  const page = read(WIZARD);
  const fnAt = page.indexOf("async function handleProfileSave");
  assert.ok(fnAt > 0, "handleProfileSave must exist");
  const fnEnd = page.indexOf("/* ─── invite helpers", fnAt);
  const body = page.slice(fnAt, fnEnd > fnAt ? fnEnd : undefined);
  assert.match(body, /try \{/, "profile save must be wrapped in try/catch");
  assert.match(body, /\} catch \(err\) \{/, "profile save must catch thrown errors (network failures)");
  assert.match(body, /\} finally \{/, "saving state must reset in finally");
  // The update error is captured and routed to the localized message.
  assert.match(body, /const \{ error: updateErr \}/, "the profiles update must destructure its error");
  assert.match(body, /console\.warn\("\[Onboarding\] profile save failed:"/, "failures must be warned with context (rule 11)");
  assert.match(body, /setProfileError\(t\("profileSaveFailed"\)\)/, "failures must show the localized onboarding.profileSaveFailed message");
  // goNext() only fires on the success path — after the error guard.
  const errGuardAt = body.indexOf("if (updateErr) {");
  const goNextAt = body.indexOf("goNext();");
  assert.ok(errGuardAt > 0 && goNextAt > errGuardAt, "goNext() must come after the update-error guard");
});

test("profile-save error is never raw — setProfileError only receives t(...) or null", () => {
  const page = read(WIZARD);
  for (const match of page.matchAll(/setProfileError\(([^)]*)\)/g)) {
    const arg = match[1].trim();
    assert.ok(
      arg === "null" || arg.startsWith("t("),
      `setProfileError must receive t(...) or null, got: ${arg}`,
    );
  }
});

test("the profile Next button shows a saving state: disabled + spinner + saving label", () => {
  const page = read(WIZARD);
  assert.match(page, /const \[profileSaving, setProfileSaving\] = useState\(false\)/, "profileSaving state must exist");
  assert.match(page, /disabled=\{!canProceed\(\) \|\| profileSaving\}/, "the Next button must disable while saving");
  // Spinner + label swap inside the profile button branch.
  const branchAt = page.indexOf('currentStepKey === "profile" ? (');
  assert.ok(branchAt > 0, "the profile button branch must exist");
  const branch = page.slice(branchAt, page.indexOf(") : (", branchAt));
  assert.match(branch, /profileSaving \? \(\s*<Loader2 className="size-4 animate-spin" \/>/, "a spinner must render while saving");
  assert.match(branch, /profileSaving \? t\("saving"\) : t\("next"\)/, "the label must swap to the existing onboarding.saving key while saving");
});

test("the inline profile error renders inside the profile step with role=alert", () => {
  const page = read(WIZARD);
  const profileStepAt = page.indexOf('currentStepKey === "profile" && (');
  const locationStepAt = page.indexOf('currentStepKey === "location" && (');
  assert.ok(profileStepAt > 0 && locationStepAt > profileStepAt, "profile step render block must exist");
  const step = page.slice(profileStepAt, locationStepAt);
  assert.match(step, /\{profileError && \(/, "the inline error must render in the profile step");
  assert.match(step, /role="alert"/, "the inline error must be announced to screen readers");
});

/* ─────────────── 4. mobile step header ─────────────── */

test("below sm: the six-label row is replaced by ONE stepProgress line; labels row is sm:+ only", () => {
  const page = read(WIZARD);
  // Mobile one-liner — references the requested onboarding.stepProgress key
  // with n/total/label params (key itself lands via the orchestrator bundle).
  const mobileLine = page.match(/<p className="mb-2 text-xs font-medium text-emerald-600 dark:text-emerald-400 sm:hidden">[\s\S]*?<\/p>/);
  assert.ok(mobileLine, "the mobile step summary line must exist and be sm:hidden");
  assert.match(mobileLine[0], /t\("stepProgress", \{/, "the mobile line must use t('stepProgress', ...)");
  assert.match(mobileLine[0], /n: currentStep/, "stepProgress must receive n");
  assert.match(mobileLine[0], /total: totalSteps/, "stepProgress must receive total");
  assert.match(mobileLine[0], /label: t\(stepLabelKeys\[currentStepKey\]\)/, "stepProgress must receive the current step label");
  // Full labels row hidden below sm:.
  assert.match(page, /<div className="mb-2 hidden justify-between sm:flex">/, "the full label row must be hidden below sm:");
  // The segmented progress bar is untouched.
  assert.match(page, /<div className="flex gap-1\.5">/, "the segmented progress bar must remain");
});

/* ─────────────── 5. PhoneCollectionDialog (layout.tsx) ─────────────── */

test("PhoneCollectionDialog never surfaces raw error.message; warns + shows localized message", () => {
  const layout = read(LAYOUT);
  assert.ok(!layout.includes("setSaveError(error.message)"), "raw Supabase error.message must never reach the UI");
  assert.match(layout, /console\.warn\("\[PhoneCollection\] phone save failed:", error\.code, error\.message\)/, "the save error must be warned with context (rule 11)");
  assert.match(layout, /setSaveError\(t\("addPhone\.saveFailed"\)\)/, "the dialog must show the localized onboarding.addPhone.saveFailed message");
  // Thrown errors (network) are caught too — no unhandled rejection from the click handler.
  assert.match(layout, /\} catch \(err\) \{\s*console\.warn\("\[PhoneCollection\] phone save failed:"/, "thrown errors must be caught and warned");
});

test("no console call in the phone dialog logs the raw phone value (rule 11)", () => {
  const layout = read(LAYOUT);
  // Console args may mention the WORD phone in string literals, but never the
  // phone state value itself.
  assert.doesNotMatch(layout, /console\.(?:log|warn|error)\([^;]*phone\.trim\(\)/, "console output must never include the raw phone value");
  assert.doesNotMatch(layout, /console\.(?:log|warn|error)\([^;]*,\s*phone\s*[,)]/, "console output must never include the raw phone variable");
});

/* ─────────────── 6. reused i18n keys exist in BOTH locales ─────────────── */

test("reused existing keys (onboarding.saving, onboarding.next, addPhone.*) exist in both bundles", () => {
  for (const localeFile of ["messages/en.json", "messages/fr.json"]) {
    const json = JSON.parse(read(localeFile));
    for (const key of ["saving", "next"]) {
      assert.equal(typeof json.onboarding?.[key], "string", `${localeFile}: onboarding.${key} must exist`);
      assert.ok(json.onboarding[key].length > 0, `${localeFile}: onboarding.${key} must be non-empty`);
    }
    for (const key of ["title", "invalid", "skip", "continue"]) {
      assert.equal(typeof json.onboarding?.addPhone?.[key], "string", `${localeFile}: onboarding.addPhone.${key} must exist`);
    }
  }
});
