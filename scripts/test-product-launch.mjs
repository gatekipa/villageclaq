import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Static guardrails for Product Sprint B — the Launch Command Center,
// activation stages, pre-send review notices, and the demo path. Style
// matches the other product suites: read sources as text, assert clause
// presence/absence/ordering. No React harness exists in this repo.

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const LIB = "src/lib/launch-readiness.ts";
const HOOK = "src/lib/hooks/use-launch-readiness.ts";
const PAGE = "src/app/[locale]/(dashboard)/dashboard/launch/page.tsx";
const NOTICE = "src/components/send-review-notice.tsx";
const DEMO = "src/components/demo-path-card.tsx";
const SIDEBAR = "src/components/layout/sidebar.tsx";
const CHECKLIST = "src/components/launch-checklist.tsx";
const DASH = "src/app/[locale]/(dashboard)/dashboard/page.tsx";
const INVITES = "src/app/[locale]/(dashboard)/dashboard/invitations/page.tsx";
const UNPAID = "src/app/[locale]/(dashboard)/dashboard/contributions/unpaid/page.tsx";
const RUNBOOK = "docs/demo-runbook.md";

const lib = read(LIB);
const hook = read(HOOK);
const page = read(PAGE);
const notice = read(NOTICE);
const demo = read(DEMO);
const en = JSON.parse(read("messages/en.json"));
const fr = JSON.parse(read("messages/fr.json"));

// ---------------------------------------------------------------------------
// 1. Readiness model semantics (launch-readiness.ts)
// ---------------------------------------------------------------------------

test("computeLaunchCenter exists with the four-state status model", () => {
  assert.match(lib, /export function computeLaunchCenter\(inputs: LaunchReadinessInputs\): LaunchCenter/);
  assert.match(lib, /"ready" \| "attention" \| "optional" \| "blocked"/);
});

test("firstMemberAccepted is blocked until invitations exist, waiting after", () => {
  assert.match(lib, /status: joined \? "ready" : invited \? "attention" : "blocked"/);
});

test("announcements never gate launch (optional, not required)", () => {
  // Always-optional status on the announcements item…
  assert.match(lib, /key: "announcements",\s*status: "optional"/);
  // …and excluded from REQUIRED_ITEM_KEYS.
  const required = lib.match(/const REQUIRED_ITEM_KEYS[^;]+;/s)?.[0] ?? "";
  assert.ok(required.includes('"groupProfile"'), "REQUIRED_ITEM_KEYS must exist");
  assert.ok(!required.includes('"announcements"'), "announcements must not be required");
  assert.ok(!required.includes('"remindersReady"'), "remindersReady must not be required (it follows automatically)");
});

test("progress numerator counts REQUIRED ready items only (no optional inflation)", () => {
  assert.match(lib, /const requiredReadyCount = REQUIRED_ITEM_KEYS\.filter\(\(k\) => byKey\.get\(k\)\?\.status === "ready"\)\.length/);
  assert.match(lib, /requiredReadyCount,/);
});

test("go-live stage requires a real joined member, not just invitations", () => {
  assert.match(lib, /golive: summaryComplete && joined/);
});

test("send-capable flags are exactly invitations, reminders, announcements", () => {
  const sendCapableTrue = (lib.match(/sendCapable: true/g) || []).length;
  assert.equal(sendCapableTrue, 3, "exactly three items are sendCapable");
  // Items that must NOT carry the flag:
  for (const key of ["groupProfile", "adminContact", "firstMemberAccepted", "duesConfigured", "firstEvent"]) {
    const block = lib.match(new RegExp(`key: "${key}",[\\s\\S]{0,400}?sendCapable: (true|false)`));
    assert.equal(block?.[1], "false", `${key} must not be sendCapable`);
  }
});

// ---------------------------------------------------------------------------
// 2. Inputs hook honesty (use-launch-readiness.ts)
// ---------------------------------------------------------------------------

test("hook throws on count failure instead of coercing to 0", () => {
  assert.match(hook, /throw res\.error/);
  assert.match(hook, /console\.warn\("\[LaunchReadiness\]/);
});

test("hook mirrors the dashboard's member semantics (active, non-proxy, minus owner)", () => {
  assert.match(hook, /\.eq\("membership_status", "active"\)\.eq\("is_proxy", false\)/);
  assert.match(hook, /Math\.max\(0, activeNonProxyCount - 1\)/);
  assert.match(hook, /\.eq\("is_active", true\)/);
});

test("hook is permission-gated (settings.manage, not raw isAdmin) and cached", () => {
  assert.match(hook, /enabled: !!groupId && canManageSetup/);
  assert.match(hook, /hasPermission\("settings\.manage"\)/);
  assert.ok(!/&& isAdmin\b/.test(hook), "hook must not gate the query on raw isAdmin");
  assert.match(hook, /staleTime: 60_000/);
});

test("hook never renders or logs the admin phone — boolean presence only", () => {
  assert.match(hook, /const adminContactReady = !!user\?\.phone/);
  assert.ok(!/console\.(log|warn|error)\([^)]*phone/.test(hook), "phone must never appear in a log call");
});

// ---------------------------------------------------------------------------
// 3. Launch Command Center page
// ---------------------------------------------------------------------------

test("page consumes the shared model and sibling components", () => {
  assert.ok(page.includes('from "@/lib/launch-readiness"'), "page must use the shared lib");
  assert.ok(page.includes('from "@/lib/hooks/use-launch-readiness"'), "page must use the inputs hook");
  assert.ok(page.includes('from "@/components/send-review-notice"'), "page must render send review notices");
  assert.ok(page.includes('from "@/components/demo-path-card"'), "page must render the demo path card");
});

test("page gates on settings.manage (permission system), not raw isAdmin", () => {
  assert.ok(page.includes('hasPermission("settings.manage")'), "page must gate on the settings.manage permission");
  assert.ok(!/if \(!isAdmin\)/.test(page), "page must not gate on raw isAdmin");
  // Don't flash the fallback while permissions resolve.
  assert.match(page, /groupLoading \|\| permsLoading/);
});

test("users without setup access get a friendly card, not an access-denied dead end", () => {
  assert.ok(page.includes('t("nonAdmin.title")'), "fallback title must render");
  assert.ok(page.includes('t("nonAdmin.backCta")'), "fallback back CTA must render");
  assert.ok(!page.includes("RequirePermission"), "no RequirePermission dead end on this page");
});

test("error state is retryable and loading shows skeletons", () => {
  assert.match(page, /<ErrorState onRetry=\{\(\) => refetch\(\)\}/);
  assert.ok(page.includes("<ListSkeleton"), "loading must show skeletons");
});

test("hero progress uses requiredReadyCount (the optional-inflation fix)", () => {
  assert.ok(page.includes("center.requiredReadyCount"), "numerator must be requiredReadyCount");
  assert.ok(!page.includes("Math.min(center.readyCount"), "the capped-readyCount bug must stay dead");
});

test("activation stepper is accessible and stage-aware", () => {
  assert.match(page, /aria-current=\{stage\.state === "current" \? "step" : undefined\}/);
  assert.match(page, /<nav aria-label=\{t\("stages\.title"\)\}/);
  assert.ok(page.includes('t("stages.currentBadge")'), "current stage must show the You-are-here chip");
});

test("blocked/waiting copy swaps on firstMemberAccepted", () => {
  assert.ok(page.includes('t("items.firstMemberAccepted.descBlocked")'));
  assert.ok(page.includes('t("items.firstMemberAccepted.descWaiting")'));
});

test("CTAs are buttonVariants Links — never a Button nested in a Link", () => {
  assert.ok(page.includes("buttonVariants({"), "CTAs must use buttonVariants");
  assert.ok(!/<Link[^>]*>\s*<Button/.test(page), "no Button inside Link");
  assert.ok(!page.includes("import { Button }"), "page should not import the Button component at all");
});

test("send review notices appear under exactly the send-capable items", () => {
  assert.match(page, /inviteMembers: "invitations"/);
  assert.match(page, /remindersReady: "reminders"/);
  assert.match(page, /announcements: "announcements"/);
  assert.match(page, /<SendReviewNotice context=\{sendContext\} variant="compact" \/>/);
});

// ---------------------------------------------------------------------------
// 4. SendReviewNotice component + integrations
// ---------------------------------------------------------------------------

test("notice is purely informational (role=note, no buttons, no handlers)", () => {
  assert.ok(notice.includes('role="note"'), "both variants must be notes");
  assert.ok(!notice.includes("onClick"), "no interactive handlers");
  assert.ok(!notice.includes("<button"), "no buttons");
});

test("full variant covers who/channels/preview/confirm plus the no-send note", () => {
  assert.match(notice, /\["who", "channels", "preview", "confirm"\] as const/);
  assert.ok(notice.includes('t("noSendNote")'), "full variant footer keeps the no-send note");
});

test("compact variant uses a per-context note, not the blanket no-send line", () => {
  // The generic "nothing goes out until you confirm" is false next to the
  // automatic daily reminders, so the compact variant must use a
  // context-specific honest tail instead.
  assert.ok(notice.includes("`${context}.compactNote`"), "compact must render a per-context note");
  const compactBlock = notice.match(/if \(variant === "compact"\)[\s\S]*?\n  \}/)?.[0] ?? "";
  assert.ok(!compactBlock.includes('t("noSendNote")'), "compact variant must NOT render the blanket no-send note");
});

test("announcements copy is truthful: opt-in, never 'not enabled'", () => {
  for (const bundle of [en, fr]) {
    const ch = bundle.launchCenter.sendReview.announcements.channels;
    // Ban the FALSE framing ("intentionally not enabled" / "volontairement
    // désactivé"); the truthful "off by default" / "désactivés par défaut"
    // must still pass.
    assert.ok(!/not enabled|intentionally|volontairement/i.test(ch), "must not claim WhatsApp is intentionally disabled/not enabled");
    assert.match(ch, /default|défaut/i, "must disclose channels are off by default / opt-in");
  }
});

test("reminders compactNote discloses the automatic schedule (no false confirmation promise)", () => {
  for (const bundle of [en, fr]) {
    const note = bundle.launchCenter.sendReview.reminders.compactNote;
    assert.match(note, /automatic|schedule|automatiquement|rythme/i, "reminders note must disclose the automatic daily sends");
  }
});

test("invitations page shows the full notice; unpaid page the compact reminders one", () => {
  assert.ok(read(INVITES).includes('<SendReviewNotice context="invitations" variant="full"'));
  assert.ok(read(UNPAID).includes('<SendReviewNotice context="reminders" variant="compact"'));
});

// ---------------------------------------------------------------------------
// 5. Demo path card + runbook
// ---------------------------------------------------------------------------

test("demo card walks the five stops and ends back at the launch center", () => {
  for (const href of ["/dashboard", "/dashboard/invitations", "/dashboard/contributions", "/dashboard/events", "/dashboard/launch"]) {
    assert.ok(demo.includes(`href: "${href}"`), `demo path must include ${href}`);
  }
  assert.ok(demo.includes('t("noSendWarning")'), "the truthful no-send warning must render");
  assert.match(demo, /aria-expanded=\{open\}/);
});

test("runbook gained the command-center backbone without losing its safety rules", () => {
  const runbook = read(RUNBOOK);
  assert.ok(runbook.includes("Launch Command Center as the demo backbone"));
  assert.ok(runbook.includes("/dashboard/launch"));
  assert.ok(runbook.includes("Never demo inside a real customer group"), "the one rule must survive");
  assert.ok(runbook.includes("857"), "the controlled-QA recipient boundary must survive");
});

// ---------------------------------------------------------------------------
// 6. Entry points: sidebar + dashboard card
// ---------------------------------------------------------------------------

test("sidebar gates the launch link on settings.manage, matching the page and data", () => {
  const s = read(SIDEBAR);
  // adminSections entry carries the SAME permission the page + hook enforce,
  // so a scoped admin without settings.manage sees neither the link nor a
  // dead end.
  assert.match(s, /key: "launchCenter", href: "\/dashboard\/launch", icon: Rocket, permission: "settings\.manage"/);
  // Non-admin officers who hold settings.manage get the link in their member
  // nav too (so nav visibility == page access for everyone).
  const settingsBlock = s.match(/if \(hasPermission\("settings\.manage"\)\) \{[\s\S]*?\n {4}\}/)?.[0] ?? "";
  assert.ok(settingsBlock.includes('key: "launchCenter"'), "settings.manage officers must see the launch link in member nav");
});

test("dashboard checklist card links to the full command center", () => {
  assert.ok(read(CHECKLIST).includes("centerHref"), "LaunchChecklist must accept centerHref");
  assert.ok(read(CHECKLIST).includes('t("openCenter")'), "footer link must be localized");
  assert.ok(read(DASH).includes('centerHref="/dashboard/launch"'), "dashboard must pass the link");
});

// ---------------------------------------------------------------------------
// 7. i18n: every launchCenter key in BOTH bundles, structurally identical
// ---------------------------------------------------------------------------

function leafPaths(obj, prefix = "") {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? leafPaths(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

test("launchCenter trees exist and are structurally identical in en and fr", () => {
  assert.ok(en.launchCenter, "en.launchCenter must exist");
  assert.ok(fr.launchCenter, "fr.launchCenter must exist");
  assert.deepEqual(leafPaths(en.launchCenter).sort(), leafPaths(fr.launchCenter).sort());
});

test("the specific keys the code references all exist", () => {
  for (const bundle of [en, fr]) {
    const lc = bundle.launchCenter;
    for (const k of ["title", "subtitle", "heroReadyBadge", "heroProgressBadge", "heroReadyDesc", "heroProgressDesc", "backToDashboard"]) {
      assert.equal(typeof lc[k], "string", `launchCenter.${k}`);
    }
    for (const s of ["ready", "attention", "optional", "blocked"]) assert.equal(typeof lc.status[s], "string", `status.${s}`);
    for (const item of ["groupProfile", "adminContact", "inviteMembers", "firstMemberAccepted", "duesConfigured", "firstEvent", "remindersReady", "announcements"]) {
      for (const leaf of ["title", "desc", "cta"]) assert.equal(typeof lc.items[item][leaf], "string", `items.${item}.${leaf}`);
    }
    for (const leaf of ["descBlocked", "descWaiting"]) assert.equal(typeof lc.items.firstMemberAccepted[leaf], "string", `items.firstMemberAccepted.${leaf}`);
    for (const s of ["title", "currentBadge", "basics", "invite", "dues", "event", "reminders", "summary", "golive"]) {
      assert.equal(typeof lc.stages[s], "string", `stages.${s}`);
    }
    for (const s of ["title", "desc", "backCta"]) assert.equal(typeof lc.nonAdmin[s], "string", `nonAdmin.${s}`);
    assert.equal(typeof lc.sendReview.title, "string");
    assert.equal(typeof lc.sendReview.noSendNote, "string");
    for (const l of ["who", "channels", "preview", "confirm"]) {
      assert.equal(typeof lc.sendReview.labels[l], "string", `sendReview.labels.${l}`);
      for (const ctx of ["invitations", "reminders", "announcements"]) {
        assert.equal(typeof lc.sendReview[ctx][l], "string", `sendReview.${ctx}.${l}`);
      }
    }
    for (const ctx of ["invitations", "reminders", "announcements"]) {
      assert.equal(typeof lc.sendReview[ctx].compactNote, "string", `sendReview.${ctx}.compactNote`);
    }
    for (const k of ["title", "desc", "step1", "step2", "step3", "step4", "step5", "noSendWarning"]) {
      assert.equal(typeof lc.demo[k], "string", `demo.${k}`);
    }
    assert.equal(typeof bundle.nav.launchCenter, "string", "nav.launchCenter");
    assert.equal(typeof bundle.dashboard.launch.openCenter, "string", "dashboard.launch.openCenter");
  }
});

test("FR launch copy is real French, not copied English", () => {
  assert.notEqual(en.launchCenter.title, fr.launchCenter.title);
  assert.notEqual(en.launchCenter.subtitle, fr.launchCenter.subtitle);
  assert.notEqual(en.launchCenter.sendReview.noSendNote, fr.launchCenter.sendReview.noSendNote);
  assert.notEqual(en.launchCenter.demo.noSendWarning, fr.launchCenter.demo.noSendWarning);
});

// ---------------------------------------------------------------------------
// 8. Customer language: no developer wording in the launch copy
// ---------------------------------------------------------------------------

test("launchCenter EN copy never leaks developer vocabulary", () => {
  const flat = leafPaths(en.launchCenter)
    .map((p) => p.split(".").reduce((o, k) => o[k], en.launchCenter))
    .join(" \n ");
  for (const banned of [/\bcron\b/i, /\bqueue\b/i, /\bprovider\b/i, /\btemplate\b/i, /\bmigration\b/i, /failed row/i, /\bproducer\b/i, /\bwebhook\b/i, /\bAPI\b/, /\bRLS\b/]) {
    assert.doesNotMatch(flat, banned, `banned developer word ${banned} in launchCenter EN copy`);
  }
});

test("no hardcoded launch copy in the page (everything through t())", () => {
  assert.ok(!page.includes("Launch Command Center</h1>"), "title must come from t()");
  assert.ok(!/Needs attention|You are here|Ready to go live/.test(page), "EN copy must not be hardcoded in the page");
});
