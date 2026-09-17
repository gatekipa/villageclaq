# PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE

**Status:** PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE  
**Audience:** Chief / Daybreak (evidence commit later). This file is local/synthetic staging. The directory name does **not** imply hosted execution.  
**This agent did not obtain credentials, probe disposable `jkorwnwwmdeflfntxntl`, contact production `llbnliixczcqfftxpsmb`, run a reset, or execute any part of this plan.**

---

## Frozen functional identity (do not requalify a different tip)

| Field | Value |
| --- | --- |
| Functional tip | `a67125309cc31ac33e601f0165cf906fb5806230` |
| Parent / F10 evidence head | `ae5d2e476c868017360cf15407cad256429ed3c6` |
| Intermediate functional | `773b5c61e9862dbe66863a9030c4a9884e0bcc25` |
| Ancestry | `ae5d2e4` → `773b5c6` → `a671253` |
| Main (do not treat as F11 authority) | `d83d13d4fe9915a0d1ff149ce29a53ad708c9853` |
| PR #83 | `a293f5958b31548ccec7591b653eff2857ae9a90` |
| F10 functional | `3a842910b3cd3cc9eafb3216e3e4f65326f003c2` |
| Draft unused PR | #106 (not authority; do not retitle #84/#85/#86) |

If the tip moves, **stop**. Do not execute this plan against any other SHA.

## Complete F11 runtime-closure identity

Computed by `buildFunctionalRecursiveRuntimeClosure()` (imports + deterministic runtime reads). **Not** the incomplete F10 27-file identity `b433bafc…`. **Not** F10 Daybreak hosted `c542aff7…` (38) or union `69279457…` (40). Those are F10 baselines only.

| Field | Value |
| --- | --- |
| File count | 42 |
| Closure digest | `ecfd265dfbab3b3c275d01e621fc47d220234cfe0e48b0d1577d9308f42dbfb3` |
| Independent-ref sha256 (frozen) | `3742c0396903f3e91a779deec9b62d93a879f134c186f3b4b817a19c6ca99c91` |
| Recognition allowlist | exactly `["manual_income"]` |
| CLI pin | `2.117.0` |

Previously omitted from the F10 27-file JS-only list and now included via canonical construction: `package.json`, `src/lib/financial-f3-recognition.ts`, `scripts/_cut3_live_functiondef_hex.json`, `00115` / `00117`, frozen `00118`–`00123`, harness, local-proof helper, plus other files actually reached by those walks (floor transforms, `00001`/`00030`/`00057` filename reads, founder repair runbook). Do not pad to 38 or 40.

## Target identity (accept / reject)

**ACCEPT only** disposable:

- ref: `jkorwnwwmdeflfntxntl`
- name: `villageclaq-f3-management-api-disposable-20260913`
- org: `eyztkzkprpmlmcabrfef`
- identity host: `db.jkorwnwwmdeflfntxntl.supabase.co`
- session-mode pooler: `aws-0-us-east-1.pooler.supabase.com:5432` user `postgres.jkorwnwwmdeflfntxntl`

**REJECT immediately** (do not continue, do not reset, do not qualify):

- production ref `llbnliixczcqfftxpsmb` (any host/user/url form)
- any other project ref, org, host, or pooler user
- Management API `POST /database/migrations {query,name}` (permanently disqualified)
- greenfield floor mode
- `--linked` / `-p` password-on-argv
- transaction pooler `:6543`

## Credential handling (secure, dedicated, not obtained here)

Placeholders only. Do **not** commit, print, or paste real secrets.

```text
VILLAGECLAQ_F3_DISPOSABLE_DB_PASSWORD=<REDACTED_DEDICATED_DISPOSABLE_DB_PASSWORD>
F3_DBPUSH_DISPOSABLE_SENTINEL=villageclaq-f3-dbpush-20260913-authorized
F3_REMOTE_DESTRUCTIVE_TEST=1
# Optional GET-only identity token — never used to apply:
# VILLAGECLAQ_F3_DISPOSABLE_MGMT_TOKEN=<REDACTED_GET_ONLY_IF_CHIEF_ISSUES>
```

Rules:

- Dedicated disposable password only. No production password. No reused personal login.
- Inject via the executor environment / secret store. Never argv `-p`. Never log the URL with the password.
- If any required secret is absent: exit 2 `NOT_RUN`. Do not invent a hosted PASS.
- Do not contact Daybreak/Astra to obtain credentials as part of this plan.

## Budget (exactly this, then stop)

1. **Exactly one** constrained reset to `CLEAN_BASELINE` on disposable `jkorwnwwmdeflfntxntl`.
2. **Exactly one** complete qualification from `00118` through `00123` on the same project, same functional tip, same closure identity.
3. **No** second reset. **No** silent patch. **No** silent retry of the whole sequence.
4. Stop on the **first unexpected** failure.

Reset scope (constrained):

- Target: disposable `jkorwnwwmdeflfntxntl` only.
- Effect: wipe that project to the documented `CLEAN_BASELINE` used by the qualifier (not a production-equivalent empty replay of `00001`–`00117`).
- After reset: leftover residual cleanup (narrow DROP of failed floor storage policy names / leftover buckets) is **not** a second wipe.
- Do **not** reset production. Do **not** reset any other ref.

Fixture limitation after reset / floor:

- Label: `DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT`
- Hosted default floor: stub+live-pin (`--floor-mode` default). Greenfield disallowed.
- `00117` via gated `psql -f` on the isolated workdir. No invented `schema_migrations` rows for `00117`.
- Recognition exactly `["manual_income"]`.
- Frozen SQL `00118`–`00123` + Catalog-V5 + independent-ref sha256 above.

## CLI / apply / repair separation (2.117.0)

- Pin: Supabase CLI **2.117.0** only.
- Apply candidate: `supabase db push --db-url [REDACTED] --workdir [ISOLATED] --yes --skip-vault`
- Repair (only after the repair-safety gate authorizes): `supabase migration repair --status applied --db-url [REDACTED] --workdir [ISOLATED] --yes`
- These are **separate** commands. Do not fold repair into push. Do not repair after unexpected SQL failures as “recovery.”
- Isolated workdir: prefix-complete, single-pending staging. Do not replay `00001`–`00116`. Do not use `00030`/`00057` transforms on hosted floor. Do not install `public.unnest(uuid)` shim on hosted floor.

## Proposed commands (placeholders — DO NOT EXECUTE)

```bash
# 0) Verify tip + closure before any DB contact
git rev-parse HEAD
# must be a67125309cc31ac33e601f0165cf906fb5806230

# 1) ONE constrained reset to CLEAN_BASELINE (disposable only).
# Exact wipe invocation is Chief-held; this plan does not add a new wipe
# executable. If Chief uses the existing qualifier wipe switch:
F3_DBPUSH_DISPOSABLE_SENTINEL=villageclaq-f3-dbpush-20260913-authorized \
F3_REMOTE_DESTRUCTIVE_TEST=1 \
VILLAGECLAQ_F3_DISPOSABLE_DB_PASSWORD='<REDACTED_DEDICATED_DISPOSABLE_DB_PASSWORD>' \
node scripts/qualify-f3-db-push-disposable.mjs \
  --wipe-to-baseline \
  --evidence-out docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F11_LOCAL_SYNTHETIC_STAGING_20260917/local-synthetic/qualify-evidence/qualify-result.json

# STOP. Confirm CLEAN_BASELINE inventory. Do not wipe again.

# 2) ONE complete qualification from 00118 (no second wipe)
F3_DBPUSH_DISPOSABLE_SENTINEL=villageclaq-f3-dbpush-20260913-authorized \
F3_REMOTE_DESTRUCTIVE_TEST=1 \
VILLAGECLAQ_F3_DISPOSABLE_DB_PASSWORD='<REDACTED_DEDICATED_DISPOSABLE_DB_PASSWORD>' \
node scripts/qualify-f3-db-push-disposable.mjs \
  --no-wipe --prep-floor --sequence-f3 \
  --evidence-out docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F11_LOCAL_SYNTHETIC_STAGING_20260917/local-synthetic/qualify-evidence/qualify-result.json
```

Evidence directory must stay `local-synthetic` / `local-synthetic-evidence`. Do **not** name a new tree `hosted/` (that implied hosted execution in F10 staging). Historical F9/F10 `hosted/` trees stay immutable.

## Expected deliberate failures vs unexpected

**Expected / deliberate (may continue only if the runner already treats them as the authorized sequence):**

- Initial `db push` history-inject failure on each F3 file (classified post-commit history failure).
- Poison-absent probe returning structured original bytes (strict original-stdout contract).
- Repair-safety gate evaluating once per file at the qualify wrapper (`gateCalls`); internal `evaluateRepairSafetyGate` calls are not extra wrapper invocations.
- Terminal `00123`: `continuationAuthorizationCalls=1`, `continuationCalls=0` (no invented later migration).
- Durable writes: Checkpoint A, Checkpoint B, and retained pre-continuation — **3 verified** writes per file on the happy path (`durableWriteAttempts` / `durableWritesVerified` counted at `writeDurableArtifactBytes`).

**Unexpected (STOP immediately; no silent patch; no second reset; no retry of the whole qual):**

- Production ref / wrong disposable identity.
- Closure incomplete / digest ≠ `ecfd265d…` at this tip (recompute only via the source builder; do not hand-edit).
- CLI ≠ 2.117.0.
- Management API apply attempted.
- Repair spawned without authorization, or repair retried after a failed repair.
- Checkpoint A not durable before retry; Checkpoint B not durable before continuation auth; B not authenticating a **reread** of A.
- `durableWritesVerified < 3` on a file that claimed continuation.
- `continuationAuthorizationCalls≠1` or `continuationCalls≠0` on `00123`.
- Fingerprint / poison / target-binding / inventory chronology HOLD that the runner does not already classify as the authorized next step.
- Any secret or absolute-path leak in evidence.
- Any edit to frozen SQL 00118–00123, Catalog-V5, recognition, independent-ref, RLS/owners/ACLs/empty `search_path`/HGP/enqueue.

## Evidence capture / finalization / independent review

1. Capture raw suite + qualify stdout locally; sanitize; durable-write; reread; hash; suite metadata; nested then **one** authoritative outer `evidence-index.json` + detached `evidence-index.sha256`.
2. Do **not** present `pack-summary` / `STATUS` counts as final. Use `buildAuthoritativeOuterEvidencePointer()` (references the index path; does **not** embed the index digest — no self-hash cycle).
3. Nested indexes/checksums are ordinary indexed artifacts. `unindexed=0`. Only the outer index/checksum are excluded from themselves.
4. Suite/log bindings vs finalized Git blobs. Label every artifact `LOCAL_SYNTHETIC`.
5. Independent review: Daybreak/Chief only, after this package exists. This plan does not authorize that review to execute the disposable.

## Stop conditions (repeat)

- First unexpected failure → STOP.
- Missing credentials → `NOT_RUN` / exit 2. Do not obtain them here.
- Any production contact → STOP and report.
- This document is **PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE**.
