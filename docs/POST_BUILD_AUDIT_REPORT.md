# VillageClaq Master Rebuild - Post-Build Audit & Repair Report

**Current repair qualification:** [Daybreak Blue consolidated repair result](QUALIFICATION_REPAIR_247C8881.md). The two confirmed defects have focused isolated repairs and regression evidence; release remains HOLD. The candidate findings below describe the pre-repair `247c8881` state and are retained as before evidence, not current repair-state claims.

## Initial candidate qualification — 2026-09-25 (historical before evidence)

**Verdict: HOLD.** Daybreak Blue tested the fetched `review-audit-m15` handoff `247c8881b875b7f013254cc3efc6ddc16bcfc3c3` in an isolated checkout. Original audit candidate `f5470a5a8659b44a304eb4c7f9550a19bf7ff991` and baseline `e192b55709fa9bab92c1f6311312df38653902d9` are available ancestors. The checkout was clean at fetch; this report, the status/runbook corrections, and the isolated SQL probe are the only current local additions. Existing work elsewhere was preserved. No production write, merge, deployment, or release approval occurred.

The controlling requirements are [Master Rebuild PRD v1 at approved commit `050be86c`](https://github.com/gatekipa/villageclaq/blob/050be86c9df3455c66b27bb5853eb786228b4009/docs/VILLAGECLAQ_MASTER_REBUILD_PRD_V1.md), its approved security revision, and amendments. The M15 runbook is supplemental. The applicable PRD clauses are P-009, F3-07, G-009, SEC-005, and the universal adversarial acceptance matrix. The repository review budget allows one initial independent round, one repair verification, and at most one final blocker-only check for this risky scope. The prior missing-candidate attempt and the rejected Astra dispatch performed no qualification round.

### Evidence reused and checks completed

| Area | Result and limit |
|------|------------------|
| F3 migration recovery | The [recovered migration patch](recovery/recovered-migrations-incomplete.patch) begins with a literal truncation marker. Its 141 visible nonblank added lines are all present in current 00118–00123 SQL. This does **not** establish that discarded edits were harmless or fully recovered. The current 00118–00123 files are unchanged from the F24 functional tip. [F24 hosted evidence](evidence/M3_F3_DAYBREAK_CATALOG_V5_F24_HOSTED_REQUAL/hosted/qualify-from-00118/) proves those six migrations applied, passed its fault gates, repaired history, and retried on a **documented qualification fixture**, not a clean 00001–00117 replay or production-equivalent floor. It does not qualify M4–M15 behavior. |
| Build and static checks | `npm ci --offline` succeeded. `npx tsc --noEmit` exited 0. `npm run build` exited 0 with network access for declared Google Fonts; the first sandbox build failed solely fetching fonts. ESLint on the changed hook/phone and finance files had 0 errors, 2 warnings. `npx eslint src --quiet` found 53 errors, all in files unchanged from the reported baseline; whole-repository lint found 82 errors across source, scripts, and historical evidence. These are not new regressions, but no mandatory gate waiver is inferred. |
| Focused local tests | Direct Node runs passed: product money 30/30, onboarding 16/16, bulk receipts 9/9, payment receipt producer 13/13. These tests establish their stated local assertions, not browser/database completion. Node 20 cannot run the F3 oracle script's `--experimental-strip-types`; the ordinary Node test-runner subprocess was sandbox-blocked, so direct script invocation was used where compatible. |
| Preview and environments | Vercel reports the exact-SHA preview `dpl_W3eSiU7LQPWi13ZVHkSix4jLjCi3` READY. The existing remote disposable `jkorwnwwmdeflfntxntl` contains the F3 qualification floor and no M4–M15 migration/user fixtures; it is not ready for essential browser journeys. A separate loopback PostgreSQL 17 cluster on port 55432 ran only the F3 stub floor for a rolled-back finance probe. Docker was not required. The exact-SHA preview was not treated as an authorized mutation target because its database binding and fictional users were not established. Production `llbnliixczcqfftxpsmb` remained read-only. |
| CI visibility | The candidate contains no `.github` workflow; GitHub returned no rulesets, while branch-protection read was denied to the integration. A Vercel success status/build exists for the SHA. The actual mandatory branch-protection/security gate set therefore remains unconfirmed. |

### Material findings requiring repair

1. **P1 financial duplicate after a lost response.** The transaction dialog creates `requestId` with `crypto.randomUUID()` in component state and resets it on close. The hook creates another random ID if omitted. The F3 RPC deduplicates manual finance by that request ID. The [isolated SQL probe](evidence/QUALIFICATION_247C8881/fresh-device-finance-retry.sql) and [result](evidence/QUALIFICATION_247C8881/fresh-device-finance-retry.result.txt) call the actual candidate RPC: first call `POSTED` (one event/two postings), same-ID retry `IDEMPOTENT_RETURN_EXISTING` (no new rows), then same economic payload with a fresh ID `POSTED` (two events/four postings total). The transaction rolls back. This violates P-009/F3-07's explicit fresh-tab/session/device lost-response recovery contract. A safe repair needs an approved stable economic occurrence or recoverable server-owned intent; hashing only amount/payload would reject legitimate distinct identical transactions. No speculative identity rule was imposed in this review.
2. **P1 consequential audit trust and atomicity.** Migration `00114` leaves `group_audit_logs.member_insert_audit_logs` allowing any active group member to INSERT with only group membership checked; earlier migration `00035` grants authenticated users table INSERT. Neither binds `actor_id` nor `action` to server authority. `useRecordTransaction` calls best-effort `logActivity` only **after** the financial RPC commits; `logActivity` ignores returned insert errors. No F3 posting trigger writes the required group audit row. Thus an authenticated member can supply a forged group audit event, and a successful financial posting can lack its separate audit entry. This contradicts SEC-005 and the PRD's consequential audit contract. The finding is a concrete code/policy path; it has not been replayed on a full-schema disposable database. A focused repair must move required evidence into an authoritative transaction and close direct client audit forgery without silently breaking other modules' audit paths. That integration needs a full-schema isolated fixture and independent review.

No product-code repair was made: the first issue needs an approved economic identity and recovery UX, and a narrow revocation of audit INSERT would leave other consequential mutations unaudited. These remain release blockers rather than silently weakened requirements. No prior milestone ID or F24 mechanics result was reopened.

### Remaining acceptance and ownership

- **Astra independent review:** Daybreak Blue dispatched to the actual `gpt-6-astra` model with the exact SHA, PRD anchors, F24/recovery evidence, and bounded scope. The platform returned HTTP 403 before the agent ran: “Reduced refusals aren't available on Astra for most Daybreak customers. You can continue using Astra with standard safeguards or switch to a model that supports Daybreak Blue.” The available delegation call exposes no safeguard selector. A prior identical 403 is recorded. No Astra findings, code changes, or PASS/HOLD exist; the independent round remains pending, not consumed.
- **Browser and migration acceptance:** Configure an isolated candidate environment with production-compatible schema/migration floor, M4–M15 migrations, fictional users/data, and explicit deployment-to-database binding. Then exercise role/tenant negatives, finance uncertain-result recovery, receipt links and notification failure, and essential EN/FR mobile browser journeys. F24 is reusable for unchanged F3 migration mechanics, not as that environment's acceptance result.
- **Mandatory CI gate decision:** Establish branch-protection/security gates from an authorized repository admin or equivalent evidence. Compare the 53 source lint errors against the unchanged baseline; changed files had 0 lint errors. Do not claim a required gate passed when its required status cannot be read.
- **Decision needed:** Jude must settle the F3-07 economic identity/recovery rule that distinguishes a fresh-device retry from a legitimate second identical transaction. The audit repair must cover server-authored transactional evidence and removal of direct client forgery across affected consequential paths. Establish an authorized full-schema fixture and the mandatory CI gate list; enable supported GPT-6 Astra standard-safeguard delegation for the independent round.
- **Release:** Repair and verify both material findings within the remaining review cap, obtain actual Astra independent review if supported, and reconcile concrete evidence. Production remains HOLD until qualification PASS **and Jude's explicit release approval**. A Vercel READY deployment is a preview build, not a live-release authorization or product PASS.

### Advisory backlog

The source lint backlog includes pre-existing React hooks and purity errors outside this focused review. The changed `useStableRouter` file has one dependency warning and `useStableSearchParams` has one unused import warning. M15 runbook's earlier blanket certification statement is corrected separately. These do not override the two material blockers above.

## Historical audit notes below — corrected where material

These are earlier audit claims, not a current candidate PASS. Where they conflict with the consolidated qualification above, the current executed evidence and PRD control.

## 1. Project State & Environment
- **Target Repository:** VillageClaq Master Rebuild
- **Current Milestone:** M15 (Program Sealed)
- **Start Commit:** `e192b55709fa9bab92c1f6311312df38653902d9` (M15: Optional Public Organization Page [program sealed])
- **Historical repair commit:** `5ca4a37` (hook/phone lint repairs); exact current handoff is `247c8881b875b7f013254cc3efc6ddc16bcfc3c3`.
- **Current Branch:** `review-audit-m15`
- **Working Tree:** Historically clean after the audit repair commit; current local qualification evidence and report edits are uncommitted and preserved.
- **Migration Restoration Note:** Uncommitted edits to F3 ledger migrations 00118–00123 were discarded in the earlier audit. The available recovered fragment is truncated and cannot establish origin, harmlessness, or complete restoration. The earlier “likely local test harness mutations or CRLF normalizations” and “safely discarded” claims are withdrawn. Current qualification depends on executed required behavior and retains this loss as unresolved provenance.

## 2. Requirements & Review Coverage (Static vs Executed)

### 2.1 Static Source Analysis (historical claim; not an independent qualification PASS)
- **Silent Fallbacks & False Success (PASS):** Validated API routes (`src/app/api/**`), hooks, and server actions. Verified exception handlers properly throw or return deterministic errors (`400`, `401`, `403`, `500`).
- **Database-to-Application Consistency (PASS):** M14/M15 hook schemas map correctly to F3 ledger bounds.
- **Graceful Degradation (PASS):** `src/lib/notify-client.ts` intentionally isolates notification delivery errors to prevent aborting successful financial ledger transactions. 
- **Typechecks & Linting (PASS/FAIL):** 
  - `npx tsc --noEmit` completed with Exit Code `0`.
  - `npm run lint` exposed P1 hydration/render defects (detailed below) which were repaired.

### 2.2 Executed Verification (PASS & BLOCKED)
- **Application Build (PASS):** `npm run build` completed successfully (`Exit Code 0`), proving the repaired static tree compiles correctly.
- **Product Domain Tests (PASS):** 
  - `npm run test:product-onboarding` (16 tests passed, Exit Code 0).
  - `npm run test:product-p0-bulk-receipts` (9 tests passed, Exit Code 0).
  - Note: Initial regex assertion in `test-product-p0-bulk-receipts` failed statically. The test searched for `template: "payment_receipt"` but the cut-2 producer migration correctly transitioned to `notificationType: "payment_receipt"`. This test was repaired to align with the new schema, successfully validating the consequential payload behavior without altering the producer.
- **Browser Workflow Execution (BLOCKED/FAIL-CLOSED):** 
  - *Context:* The `.env.local` configuration correctly neutralizes production credentials (`NEXT_PUBLIC_SUPABASE_URL` is commented out) to prevent unauthorized production mutation. No authorized test configuration was provided.
  - *Result:* When starting the dev server (`npm run dev`), the application correctly refuses to boot and fails closed with `Uncaught Error: Your project's URL and Key are required...`. Essential browser journeys are strictly BLOCKED by this configuration, but this correctly demonstrates that the app does not silently mock services or leak environment state.
- **Database Integration Suite (historical BLOCKED; current partial execution):** The Unix-socket harness is not directly usable on this Windows host, but Docker is not inherently required. The current review started isolated loopback PostgreSQL 17, applied the F3 stub floor, and executed the rolled-back finance retry probe above. Full-schema M4–M15 qualification remains pending.

## 3. Confirmed Defects & Focused Repairs
- **Defect 1 - P1 React Hydration Violations (Repaired):** The lint harness surfaced critical violations in three UI hooks (`use-stable-router`, `use-stable-search-params`, and `use-throttled-callback`) and two components (`use-require-admin.ts`, `phone-input.tsx`). The hooks mutated `useRef` directly during render (`routerRef.current = router`), and `phone-input.tsx` conditionally called `setState` inside an effect triggered by a prop change (`react-hooks/set-state-in-effect`).
  - *Impact:* Can trigger cascading render crashes in React 19 / Next.js concurrent hydration.
  - *Repair:* Moved ref assignments to safe `useEffect` blocks. In `phone-input`, replaced the effect synchronization with a standard render-phase synchronization (`if (value !== prevValue)`), preserving phone-input state consistency and admin redirect timing without degrading callback freshness.
- **Defect 2 - P0 Stale Test Assertion (Repaired):** The `bulk-receipts` test failed against the modernized notification pipeline as documented above.

## 4. Release Blockers and Disposition
**DISPOSITION: HOLD**

The earlier static-soundness and Docker-only statements are superseded by the current consolidated qualification. The two demonstrated material findings above independently require HOLD, with browser and full-schema acceptance still pending.
