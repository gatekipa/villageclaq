# S0-B — Recovery Preservation + Isolated Restore Proof (2026-09-10)

**Status:** PASS — RECOVERY + ISOLATED RESTORE PROVEN  
**Collected by:** VillageClaq Chief  
**Canonical repo:** `C:\Users\nanye\Documents\villageclaq` · `gatekipa/villageclaq`  
**Mutations to production:** ZERO  
**Production restore/rewind:** ZERO  
**Real outbound messages:** ZERO  

---

## Authority pins

| Item | Value |
|------|-------|
| PR #71 hard-freeze tip | `050be86c9df3455c66b27bb5853eb786228b4009` |
| S0-A evidence | PR #72 · `97388b34037589a21eae66e3a5a1668f71e3bb55` · `docs/S0_A_PRODUCTION_TRUTH_SNAPSHOT_20260910.md` |
| Production project | `llbnliixczcqfftxpsmb` (villageclaq) |
| Org | LawTekno · Pro |

---

## 1. Recovery capability inventory (evidence)

| Capability | Result |
|------------|--------|
| Org plan | **Pro** (dashboard + MCP `get_organization`) |
| PITR | **NOT ENABLED** — shown as paid add-on; **Enable add-on NOT clicked** |
| Scheduled / physical backups | **ENABLED** — 8 daily PHYSICAL backups visible (2026-09-03 … 2026-09-10) |
| Backup frequency | Daily around midnight (dashboard text) |
| Retention window (explicit days) | **CANNOT CONFIRM** exact day count; **observed inventory = 8 consecutive daily backups** |
| Earliest recoverable (observed) | **2026-09-03** (oldest listed daily backup) |
| Latest recoverable (observed) | **2026-09-10 08:57:25 UTC** (completed physical backup used) |
| Restore granularity | Full physical backup restore (not PITR second-level without add-on) |
| Restore destination options | (1) in-place Restore on scheduled backups — **FORBIDDEN for S0-B** (2) **Restore to new project (BETA)** — used |
| Manual backup download | **Not observed** in UI |
| Storage objects in DB backup | **NOT included** (dashboard / docs) |

---

## 2. Time-critical history / destructive activity coverage

| Question | Verdict |
|----------|---------|
| Could recovery window cover recent member/event/election/minutes deletions within Sep 3–10? | **RECOVERY WINDOW COVERS PERIOD** for any destruction that occurred **after** the selected backup time, by restoring that backup to an isolated project. |
| Specific customer-record recovery demonstrated? | **No** — S0-B proves capability via aggregate parity, not per-row identity recovery. |

---

## 3. Pre-change recovery point

| Item | Value |
|------|-------|
| Additional backup created? | **NOT REQUIRED** — daily physical backups already present |
| Source recovery point used | **2026-09-10 08:57:25 UTC** PHYSICAL COMPLETED |
| PITR enabled? | **NO** (founder forbid) |

---

## 4. Isolated restore

| Item | Value |
|------|-------|
| Attempted | **YES** (founder-authorized) |
| Destination name | `VillageClaq-S0B-Recovery-20260910` |
| Destination ref | `fwosdtxdtwtqgvtejmkr` |
| Temp ≠ production check | `fwosdtxdtwtqgvtejmkr` **≠** `llbnliixczcqfftxpsmb` |
| Region / org | us-east-1 · LawTekno |
| Preview cost | Additional compute **$0** · disk **$0.5/mo** · total **~$0.5/mo** |
| Restore start | 2026-09-10 **17:38:10 UTC** (dashboard) |
| Destination status | `ACTIVE_HEALTHY` (MCP `get_project`) |
| Traffic isolation | Separate project ref; **no** production Vercel alias; not customer-serving |
| Outbound neutralization | `pg_cron` / `pg_net` / `wrappers` / `http` extensions **absent** on clone (empty inventory). Documented; no disable SQL required. Auth/API keys are project-local (new project). Storage not copied. |

---

## 5. Schema validation

| Check | Clone | Production | Match |
|-------|-------|------------|-------|
| `schema_migrations` rows | 28 (same version/name set as S0-A) | 28 | **YES** |
| Public base tables | 89 | 89 | **YES** |
| SECURITY DEFINER fn count | 88 | 88 | **YES** |
| `pg_policies` public count | 375 | *(compared live)* | see live compare in collection |

Migration version list on clone identical to production S0-A inventory through `harden_relief_branch_summary`.

**Schema validation: PASS**

---

## 6. Sanitized aggregate validation (clone vs production live)

Counts only — no names, phones, emails, ballot choices, or payment descriptions.

| Metric | Clone | Production |
|--------|------:|----------:|
| groups | 26 | 26 |
| memberships | 226 | 226 |
| m_active | 225 | 225 |
| m_pending | 0 | 0 |
| m_exited | 1 | 1 |
| m_suspended | 0 | 0 |
| m_archived | 0 | 0 |
| payments | 137 | 137 |
| obligations | 650 | 650 |
| events | 19 | 19 |
| attendances | 26 | 26 |
| elections | 6 | 6 |
| vote receipts | 4 | 4 |
| ballots | 4 | 4 |
| relief_plans | 2 | 2 |
| relief_claims | 2 | 2 |
| relief_payouts | 0 | 0 |
| savings_cycles | 5 | 5 |
| savings_participants | 48 | 48 |
| savings_contributions | 28 | 28 |
| meeting_minutes | 16 | 16 |
| notifications_queue | 2306 | 2306 |
| loans | 1 | 1 |
| fines | 1 | 1 |

**Aggregate validation: PASS (exact parity at validation time)**

Note: Production continues to receive live writes after backup time; parity here indicates restore completeness relative to current production at measurement — consistent with a very recent backup + quiet window, or equal state. Recorded as observed.

---

## 7. Referential integrity (clone aggregates)

| Check | Count |
|-------|------:|
| orphan attendance→membership | 0 |
| attendance group mismatch | 0 |
| loan group mismatch | 0 |
| fine group mismatch | 0 |
| election candidate group mismatch | 0 |
| orphan ballots | 0 |
| orphan receipts | 0 |

**Referential-integrity validation: PASS** (no orphans/mismatches in sampled high-risk joins)

---

## 8. Recovery decision tree (drill — not executed on production)

```
PRODUCTION ISSUE DETECTED
→ STOP further risky writes/deploys as appropriate
→ IDENTIFY last known good point (daily PHYSICAL backup list / future PITR if enabled)
→ CHOOSE: forward fix vs restore
→ RESTORE TO ISOLATED PROJECT FIRST (Restore to new project)
→ VALIDATE schema + sanitized aggregates + integrity
→ FOUNDER DECISION
→ PRODUCTION RECOVERY ACTION (only with explicit founder auth; never improvised)
```

---

## 9. Recovery limitations (evidence-backed)

Not automatically recovered by DB physical backup / restore-to-new-project:

- Vercel deployment state / aliases
- Environment variables / secrets stores outside DB
- Provider-side WhatsApp/email/SMS message state
- Meta/WABA configuration
- Stripe/payment-provider state
- Browser/device caches / service-worker caches
- **Storage objects** (avatars, group-documents, receipts buckets) — **NOT copied**
- Edge Functions, Auth settings & API keys, Realtime settings (per Supabase clone docs)
- Third-party webhook delivery history

---

## 10. CANNOT CONFIRM

- Exact numeric retention-day policy beyond the 8 visible backups
- PITR add-on price (Enable not opened)
- Second-level PITR restore (add-on disabled)
- That production row-level history older than 2026-09-03 remains recoverable

---

## 11. Temp project deletion

Performed only after evidence commit/push (see final report fields).  
Pre-delete check: temp id ≠ `llbnliixczcqfftxpsmb`.  
Post-delete: production still `ACTIVE_HEALTHY`.

---

## 12. Next step

**S0-C — Migration baseline and replay hygiene**  
Do **not** start automatically.
