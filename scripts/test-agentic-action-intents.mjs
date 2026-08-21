import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Phase 1A — Agentic Execution OS foundation guardrails.
//
// Phase 1A ships a schema and a REVIEW-ONLY inbox. Live agentic execution is
// NOT approved. These tests pin that boundary: the ledger exists on paper, the
// UI can read but never act, nothing sends, no cron touches it, and the
// migration stays create-not-apply. They are static — no DB is touched.

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(root, rel));

const MIGRATION = "supabase/migrations/00113_agentic_action_intents.sql";
const PAGE = "src/app/[locale]/(dashboard)/dashboard/execution-inbox/page.tsx";
const SIDEBAR = "src/components/layout/sidebar.tsx";

const MIG = read(MIGRATION);
const PAGE_SRC = read(PAGE);

/** Strip SQL line comments so assertions test real statements, not prose. */
const MIG_SQL = MIG.replace(/^\s*--.*$/gm, "");
/** Strip JS/TS comments so scans test real code, not the explanatory banner. */
const PAGE_CODE = PAGE_SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function walk(rel, exts, out = []) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const child = path.join(rel, entry.name);
    if (entry.isDirectory()) walk(child, exts, out);
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(child);
  }
  return out;
}

// ── Migration shape: the ledger, and ONLY the ledger ────────────────────────

test("00113 exists and creates exactly one table: action_intents", () => {
  assert.ok(exists(MIGRATION), "00113 present");
  const created = [...MIG_SQL.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+([a-z_.]+)/gi)].map((m) => m[1]);
  assert.deepEqual(created, ["public.action_intents"], "only action_intents is created");
  // No destructive DDL against anything that already exists.
  assert.ok(!/\bDROP TABLE\b/i.test(MIG_SQL), "no DROP TABLE");
  assert.ok(!/\bALTER TABLE\s+(?!public\.action_intents)/i.test(MIG_SQL), "no ALTER on other tables");
  assert.ok(!/\bTRUNCATE\b/i.test(MIG_SQL), "no TRUNCATE");
});

test("00113 performs no DML — it cannot mutate production data on apply", () => {
  // The audit INSERT lives inside a trigger function body (runs only when a row
  // is written later), never at migration top level. Strip function bodies and
  // assert what remains is DDL only.
  const withoutBodies = MIG_SQL.replace(/AS \$\$[\s\S]*?\$\$;/g, "AS $$<body>$$;");
  for (const verb of [/\bINSERT\s+INTO\b/i, /\bUPDATE\s+[a-z_.]+\s+SET\b/i, /\bDELETE\s+FROM\b/i]) {
    assert.ok(!verb.test(withoutBodies), `no top-level ${verb} in the migration`);
  }
});

test("00113 is marked CREATE-NOT-APPLY", () => {
  assert.match(MIG, /CREATE-NOT-APPLY/, "banner present");
  assert.match(MIG, /not applied/i, "states it is not applied");
});

// ── Constrained vocabularies ────────────────────────────────────────────────

test("status is constrained to exactly the six lifecycle values", () => {
  const m = MIG_SQL.match(/action_intents_status_check CHECK \(\s*status = ANY \(ARRAY\[([^\]]+)\]\)/);
  assert.ok(m, "status CHECK present");
  const values = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
  assert.deepEqual(values, ["approved", "cancelled", "executed", "failed", "pending", "rejected"]);
});

test("proposed_action covers the Phase 1 action vocabulary", () => {
  const m = MIG_SQL.match(/action_intents_proposed_action_check CHECK \(\s*proposed_action = ANY \(ARRAY\[([\s\S]*?)\]\)/);
  assert.ok(m, "proposed_action CHECK present");
  const values = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
  assert.deepEqual(values, [
    "announcement_draft",
    "attendance_followup",
    "payment_reminder",
    "receipt_review",
    "relief_followup",
    "savings_round_advance",
    "standing_change_notice",
  ]);
});

test("priority is constrained and confidence_score is bounded to 0..1", () => {
  assert.match(MIG_SQL, /priority = ANY \(ARRAY\['low', 'normal', 'high', 'urgent'\]\)/);
  assert.match(MIG_SQL, /confidence_score >= 0 AND confidence_score <= 1/);
});

test("a row cannot claim execution without a recorded human approval", () => {
  assert.match(
    MIG_SQL,
    /status <> 'executed' OR approved_at IS NOT NULL/,
    "execute-requires-approval CHECK present",
  );
});

test("idempotency is unique per (group, action, key) and ignores NULL keys", () => {
  assert.match(
    MIG_SQL,
    /CREATE UNIQUE INDEX IF NOT EXISTS uniq_action_intents_idempotency\s+ON public\.action_intents\(group_id, proposed_action, idempotency_key\)\s+WHERE idempotency_key IS NOT NULL/,
  );
});

// ── RLS model ───────────────────────────────────────────────────────────────

test("RLS is enabled on action_intents", () => {
  assert.match(MIG_SQL, /ALTER TABLE public\.action_intents ENABLE ROW LEVEL SECURITY;/);
});

test("anon/public get no grant and no policy — public reads are impossible", () => {
  for (const stmt of MIG_SQL.match(/CREATE POLICY[\s\S]+?;/g) || []) {
    assert.ok(!/TO\s+(public|anon)\b/i.test(stmt), `policy granted to public/anon:\n${stmt}`);
    assert.match(stmt, /TO authenticated/, "every policy is scoped TO authenticated");
  }
  assert.match(MIG_SQL, /REVOKE ALL ON public\.action_intents FROM PUBLIC, anon;/);
  assert.ok(!/GRANT[^;]*ON public\.action_intents[^;]*TO[^;]*anon/i.test(MIG_SQL), "no grant to anon");
});

test("SELECT policy enforces the tenant boundary before any authority check", () => {
  const m = MIG_SQL.match(/CREATE POLICY "rls_ai_select"[\s\S]+?;/);
  assert.ok(m, "select policy present");
  const policy = m[0];
  assert.match(policy, /group_id IN \(SELECT public\.get_user_group_ids\(\)\)/, "cross-group access impossible");
  assert.match(policy, /public\.is_group_admin\(group_id\)/, "admins/owners may read");
  assert.match(policy, /finances\.view/, "finance permission may read");
  assert.match(policy, /finances\.manage/, "finance-manage permission may read");
  assert.match(policy, /action_intent_is_financial\(proposed_action\)/, "finance read is limited to finance-class intents");
});

test("plain membership alone never grants read — a member cannot read another member's intent", () => {
  const policy = MIG_SQL.match(/CREATE POLICY "rls_ai_select"[\s\S]+?;/)[0];
  // is_group_member would make every member of the group a reader.
  assert.ok(!/is_group_member\s*\(/.test(policy), "no bare membership read branch");
  // No self-read branch either in 1A; if one is ever added it must be deliberate.
  assert.ok(!/target_user_id\s*=\s*auth\.uid\(\)/.test(policy), "no member self-read branch in 1A");
});

test("all direct client writes are blocked (writes go via service role / definer RPCs)", () => {
  const m = MIG_SQL.match(/CREATE POLICY "rls_ai_no_direct_writes"[\s\S]+?;/);
  assert.ok(m, "write-block policy present");
  assert.match(m[0], /FOR ALL/);
  assert.match(m[0], /USING \(false\) WITH CHECK \(false\)/);
  // authenticated may read, never write.
  assert.match(MIG_SQL, /GRANT SELECT ON public\.action_intents TO authenticated;/);
  assert.ok(
    !/GRANT[^;]*\b(INSERT|UPDATE|DELETE|ALL)\b[^;]*ON public\.action_intents[^;]*TO authenticated/i.test(MIG_SQL),
    "authenticated is never granted write privileges",
  );
});

// ── Audit model ─────────────────────────────────────────────────────────────

test("every status change is audited by trigger, not by caller discipline", () => {
  assert.match(MIG_SQL, /CREATE OR REPLACE FUNCTION public\.action_intents_audit\(\)/);
  assert.match(MIG_SQL, /AFTER INSERT OR UPDATE ON public\.action_intents/);
  assert.match(MIG_SQL, /'action_intent\.created'/, "created event");
  assert.match(MIG_SQL, /'action_intent\.' \|\| NEW\.status/, "approved/rejected/executed/failed/cancelled derive from status");
  assert.match(MIG_SQL, /INSERT INTO group_audit_logs \(group_id, actor_id, action, entity_type, entity_id, details\)/,
    "matches the house audit column list");
  assert.match(MIG_SQL, /NEW\.status IS DISTINCT FROM OLD\.status/, "only real status transitions are logged");
});

test("audit failure can never roll back the ledger write", () => {
  assert.match(MIG_SQL, /EXCEPTION WHEN OTHERS THEN\s*\n\s*NULL;/);
});

// ── Approval RPCs exist but cannot execute, and are not callable in 1A ──────

test("approve/reject RPCs re-check permissions server-side", () => {
  for (const fn of ["approve_action_intent", "reject_action_intent"]) {
    const m = MIG_SQL.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}[\\s\\S]+?\\$\\$;`));
    assert.ok(m, `${fn} defined`);
    assert.match(m[0], /SECURITY DEFINER/, `${fn} is definer`);
    assert.match(m[0], /SET search_path TO 'public'/, `${fn} pins search_path`);
    assert.match(m[0], /is_group_admin\(v_intent\.group_id\)/, `${fn} checks authority`);
    assert.match(m[0], /RAISE EXCEPTION 'not authorised/, `${fn} refuses unauthorised callers`);
    assert.match(m[0], /only pending intents/, `${fn} refuses non-pending rows`);
  }
});

test("decision RPCs lock the row and guard the UPDATE against a concurrent decision", () => {
  for (const fn of ["approve_action_intent", "reject_action_intent"]) {
    const m = MIG_SQL.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}[\\s\\S]+?\\$\\$;`));
    assert.match(m[0], /WHERE id = p_intent_id FOR UPDATE;/, `${fn} locks the row before validating status`);
    assert.match(m[0], /WHERE id = p_intent_id AND status = 'pending'/, `${fn} guards the UPDATE on status`);
    assert.match(m[0], /decided concurrently/, `${fn} fails loudly if it loses the race`);
  }
});

test("no RPC can set status='executed' — execution is not expressible in Phase 1A", () => {
  const rpcs = MIG_SQL.match(/CREATE OR REPLACE FUNCTION public\.(approve|reject)_action_intent[\s\S]+?\$\$;/g) || [];
  assert.equal(rpcs.length, 2, "exactly the two decision RPCs");
  for (const fn of rpcs) {
    assert.ok(!/'executed'/.test(fn), "no RPC writes the executed status");
    assert.ok(!/executed_by|executed_at|execution_result/.test(fn), "no RPC fills execution columns");
  }
});

test("decision RPCs are not granted to authenticated in Phase 1A", () => {
  assert.match(MIG_SQL, /REVOKE ALL ON FUNCTION public\.approve_action_intent\(uuid, text\) FROM PUBLIC, anon, authenticated;/);
  assert.match(MIG_SQL, /REVOKE ALL ON FUNCTION public\.reject_action_intent\(uuid, text\) FROM PUBLIC, anon, authenticated;/);
  assert.ok(
    !/GRANT EXECUTE ON FUNCTION public\.(approve|reject)_action_intent\(uuid, text\) TO authenticated/.test(MIG_SQL),
    "no EXECUTE grant to authenticated until 1B",
  );
});

// ── The inbox is review-only ────────────────────────────────────────────────

test("inbox page exists, is permission-gated, and matches its sidebar gate", () => {
  assert.ok(exists(PAGE), "page present");
  assert.match(PAGE_CODE, /<RequirePermission anyOf=\{INBOX_PERMISSIONS\}>/, "page is gated");
  assert.match(PAGE_CODE, /const INBOX_PERMISSIONS = \["finances\.view", "finances\.manage"\]/);
  const sidebar = read(SIDEBAR);
  assert.match(sidebar, /key: "executionInbox", href: "\/dashboard\/execution-inbox"/, "nav entry exists");
  assert.match(
    sidebar,
    /anyPermission: \["finances\.view", "finances\.manage"\]/,
    "nav gate equals page gate — no dead ends, no over-exposure",
  );
  assert.match(
    sidebar,
    /hasAnyPermission\("finances\.view", "finances\.manage"\)/,
    "position-scoped nav uses the same gate",
  );
});

test("page/nav gate grants nothing the RLS read policy cannot honour", () => {
  // A permission that opens the page but not the rows is a dead end: the user
  // lands on "no proposals" instead of an honest access answer.
  const gate = PAGE_CODE.match(/const INBOX_PERMISSIONS = \[([^\]]+)\]/)[1];
  const granted = [...gate.matchAll(/"([a-z.]+)"/g)].map((m) => m[1]);
  const policy = MIG_SQL.match(/CREATE POLICY "rls_ai_select"[\s\S]+?;/)[0];
  for (const perm of granted) {
    assert.ok(
      policy.includes(`'${perm}'`),
      `${perm} opens the page but has no branch in the RLS read policy`,
    );
  }
});

test("inbox page contains NO mutation path of any kind", () => {
  for (const verb of [/\.insert\(/, /\.update\(/, /\.delete\(/, /\.upsert\(/, /\.rpc\(/]) {
    assert.ok(!verb.test(PAGE_CODE), `page must not call ${verb}`);
  }
  // fetch() to an API route would be an execution channel; react-query's
  // refetch() is a read and is fine.
  assert.ok(!/[^e]\bfetch\(/.test(PAGE_CODE.replace(/refetch\(/g, "")), "page performs no fetch()");
});

test("approve/reject controls are rendered disabled and wired to nothing", () => {
  const buttons = [...PAGE_CODE.matchAll(/<Button[^>]*>[\s\S]{0,80}?t\("(approve|reject)"\)/g)];
  assert.equal(buttons.length, 2, "both decision buttons are present in the layout");
  for (const b of buttons) {
    assert.match(b[0], /disabled/, `${b[1]} button is disabled`);
    assert.ok(!/onClick/.test(b[0]), `${b[1]} button has no handler`);
  }
  assert.match(PAGE_CODE, /decisionsDisabled/, "the disabled state is explained to the user");
});

test("confidence is rendered with locale-aware percent formatting", () => {
  assert.match(PAGE_CODE, /new Intl\.NumberFormat\(locale, \{ style: "percent"/, "uses Intl percent style");
  assert.ok(!/Math\.round\(intent\.confidence_score \* 100\)/.test(PAGE_CODE), "no hardcoded % literal");
});

test("the keyboard-navigable list exposes listbox/option semantics", () => {
  assert.match(PAGE_CODE, /role="listbox"/, "container is a listbox");
  assert.match(PAGE_CODE, /aria-activedescendant=/, "active option is announced");
  assert.match(PAGE_CODE, /role="option"/, "rows are options");
  assert.match(PAGE_CODE, /id=\{`action-intent-\$\{intent\.id\}`\}/, "rows carry stable ids");
});

test("inbox degrades gracefully when the ledger table is absent (create-not-apply)", () => {
  assert.match(PAGE_CODE, /const UNDEFINED_TABLE = "42P01"/, "undefined_table handled by code");
  assert.match(PAGE_CODE, /error\.code === UNDEFINED_TABLE/);
  assert.match(PAGE_CODE, /notEnabled: true/, "renders a not-enabled state rather than an error");
});

// ── Nothing sends, nothing executes ─────────────────────────────────────────

const SEND_MODULES = [
  "whatsapp", "africastalking", "resend", "notifications_queue", "notification-queue",
  "payment-receipt-producer", "payment-reminder-producer", "announcement-producer",
  "send-whatsapp", "sms/send", "email/send",
];

test("no Phase 1A file imports or references a send/queue path", () => {
  for (const [label, code] of [["page", PAGE_CODE], ["migration", MIG_SQL]]) {
    for (const mod of SEND_MODULES) {
      assert.ok(
        !new RegExp(mod.replace(/[/-]/g, "[/-]"), "i").test(code),
        `${label} must not reference ${mod}`,
      );
    }
  }
});

test("no cron route reads, writes, or executes action intents", () => {
  const cronFiles = walk("src/app/api/cron", [".ts"]);
  assert.ok(cronFiles.length > 0, "sanity: cron routes exist to check");
  for (const rel of cronFiles) {
    assert.ok(!/action_intents/.test(read(rel)), `${rel} must not touch action_intents`);
  }
});

test("no API route or server lib references action_intents in Phase 1A", () => {
  const offenders = [];
  for (const rel of [...walk("src/app/api", [".ts"]), ...walk("src/lib", [".ts", ".tsx"])]) {
    if (/action_intents/.test(read(rel))) offenders.push(rel);
  }
  assert.deepEqual(offenders, [], "the ledger is read only by the inbox page in 1A");
});

test("no auto-approval or execution worker exists anywhere in src", () => {
  for (const rel of walk("src", [".ts", ".tsx"])) {
    const code = read(rel).replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/approve_action_intent|reject_action_intent/.test(code), `${rel} must not call the decision RPCs in 1A`);
    assert.ok(!/executeActionIntent|runActionIntents|autoApprove/.test(code), `${rel} must not define an executor`);
  }
});

// ── i18n ────────────────────────────────────────────────────────────────────

test("executionInbox namespace exists in both locales with identical keys", () => {
  const en = JSON.parse(read("messages/en.json"));
  const fr = JSON.parse(read("messages/fr.json"));
  assert.ok(en.executionInbox && fr.executionInbox, "namespace present in both");
  assert.deepEqual(
    Object.keys(en.executionInbox).sort(),
    Object.keys(fr.executionInbox).sort(),
    "identical key sets",
  );
  assert.equal(typeof en.nav.executionInbox, "string");
  assert.equal(typeof fr.nav.executionInbox, "string");
  // "Action" and "Source" are the same word in French; everything else must
  // actually be translated, so a copy-pasted English string fails here.
  const SAME_IN_FRENCH = new Set(["colAction", "colSource"]);
  for (const [k, v] of Object.entries(fr.executionInbox)) {
    assert.ok(typeof v === "string" && v.length > 0, `fr.executionInbox.${k} is non-empty`);
    if (!SAME_IN_FRENCH.has(k)) {
      assert.notEqual(v, en.executionInbox[k], `fr.executionInbox.${k} is untranslated English`);
    }
  }
});

test("every t() key the page uses resolves in both locales", () => {
  const en = JSON.parse(read("messages/en.json"));
  const fr = JSON.parse(read("messages/fr.json"));
  const literal = [...PAGE_CODE.matchAll(/\bt\("([A-Za-z0-9_]+)"\)/g)].map((m) => m[1]);
  assert.ok(literal.length > 10, "sanity: page uses many keys");
  for (const key of literal) {
    assert.notEqual(en.executionInbox[key], undefined, `en.executionInbox.${key}`);
    assert.notEqual(fr.executionInbox[key], undefined, `fr.executionInbox.${key}`);
  }
  // Template keys: t(`status${pascal(...)}`) / t(`action${...}`) / t(`priority${...}`)
  const STATUSES = ["Pending", "Approved", "Rejected", "Executed", "Cancelled", "Failed"];
  const PRIORITIES = ["Low", "Normal", "High", "Urgent"];
  const ACTIONS = ["PaymentReminder", "ReceiptReview", "StandingChangeNotice", "ReliefFollowup",
                   "SavingsRoundAdvance", "AttendanceFollowup", "AnnouncementDraft"];
  for (const [prefix, list] of [["status", STATUSES], ["priority", PRIORITIES], ["action", ACTIONS]]) {
    for (const suffix of list) {
      const key = `${prefix}${suffix}`;
      assert.notEqual(en.executionInbox[key], undefined, `en.executionInbox.${key}`);
      assert.notEqual(fr.executionInbox[key], undefined, `fr.executionInbox.${key}`);
    }
  }
});

// ── Cross-guards: prior phases stay intact ──────────────────────────────────

test("P0 bulk-record receipt guard remains intact", () => {
  const r = read("src/app/[locale]/(dashboard)/dashboard/contributions/record/page.tsx");
  assert.ok(/const \[bulkSendReceipts, setBulkSendReceipts\] = useState\(false\)/.test(r), "receipts opt-in default OFF");
  assert.ok(/disabled=\{bulkSubmitting \|\| \(bulkSendReceipts && !bulkReconfirm\)\}/.test(r), "reconfirm gate intact");
});

test("/api/admin/query lockdown remains intact", () => {
  const route = read("src/app/api/admin/query/route.ts");
  assert.match(route, /import \{ validateSelect, isAllowedColumn \} from "@\/lib\/admin-query-config"/);
  const vIdx = route.indexOf("validateSelect(");
  const adminIdx = route.indexOf("supabaseServiceKey);");
  assert.ok(vIdx > -1, "validateSelect is called");
  assert.ok(adminIdx > -1, "service-role client is constructed");
  assert.ok(vIdx < adminIdx, "validation precedes the service-role client");
});

test("Build 8 announcement producer remains dormant", () => {
  assert.match(read("src/lib/announcement-producer.ts"), /DORMANT — Build 8/);
});

test("00112 storage read-policy hardening remains intact", () => {
  const sql = read("supabase/migrations/00112_storage_select_policy_hardening.sql");
  assert.match(sql, /DROP POLICY IF EXISTS "Anyone can view receipts"/);
  assert.match(sql, /CREATE POLICY "receipts_select_group" ON storage\.objects FOR SELECT TO authenticated/);
  assert.match(sql, /CREATE POLICY "gdocs_select_group" ON storage\.objects FOR SELECT TO authenticated/);
});

test("Report 16 fix remains in place", () => {
  const page = read("src/app/[locale]/(dashboard)/dashboard/reports/[reportId]/page.tsx");
  const earlyReturn = page.indexOf("if (isLoading) return");
  const after = page.slice(earlyReturn);
  assert.ok(!/\buse(State|Effect|Callback|Memo|Ref|Query)\s*\(/.test(after.replace(/^\s*\/\/.*$/gm, "")),
    "no hooks after the early return");
  const en = JSON.parse(read("messages/en.json"));
  assert.equal(typeof en.reports.healthScore, "string", "reports.healthScore still present");
});
