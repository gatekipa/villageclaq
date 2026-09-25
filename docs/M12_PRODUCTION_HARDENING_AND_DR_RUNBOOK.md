# Milestone 12: Production Hardening & Disaster Recovery Runbook

This document defines the zero-trust production posture, multi-tenant boundaries, and ledger reconstruction invariants established during Stage M12. It serves as the authoritative guide for auditing the VillageClaq financial ledger and executing catastrophic recovery.

## 1. Zero-Trust Database Posture & RLS Fortification

### Dynamic `search_path` Security
To prevent schema hijacking within elevated privileges, **all** `SECURITY DEFINER` routines across `public` and `financial_core` explicitly override their schema path to `''`. This ensures malicious user inputs cannot alter search paths to intercept execution calls.
* **Audit Enforcement:** `scripts/audit-sql.js` statically parsing or scanning global `ALTER FUNCTION ... SET search_path = ''` scripts.
* **Migration Target:** Executed canonically via `00133_m12_01_security_hardening.sql`.

### Tenant Isolation & Grant Hardening
All tables, including internal ledger states (`epoch_transitions`, `postings`), are enforced via `ENABLE ROW LEVEL SECURITY`. 
- `financial_core` schemas execute under an explicit zero-trust model. `EXECUTE` privileges are universally **revoked** from `public` and `anon`. 
- Execution is tightly restricted to authenticated sessions invoking `SECURITY DEFINER` procedures or the Vercel `service_role`.

## 2. Universal Ledger Cryptography & Disaster Recovery

### The Ledger Snapshot
Ledgers are chronologically deterministic. A `LedgerSnapshot` encapsulates:
1. Chart of Accounts (Names, Classes, Normal Balances)
2. Journal Postings (Double-entry streams linked by Event IDs)
3. Epoch Boundary Markers (Chronological freeze points)
4. Trial Balance Proofs (Expected resulting state)

Every snapshot is serialized, lexically sorted, and sealed with a **SHA-256 fingerprint**. 

### Cold-Start Rehydration Protocol (`ledger-replay.ts`)
If a catastrophic partition loss occurs, tenant ledgers can be replayed algorithmically:
1. **Fingerprint Validation:** The engine recalculates the SHA-256 payload. Any bit-flip or manual SQL row mutation triggers an immediate `LedgerIntegrityException`.
2. **Boundary Validation:** Assert no foreign `group_id` crosses into the memory graph.
3. **Equilibrium Replay:** Reconstruct the Cumulative Normal Balance starting from absolute zero. 
   - Postings mapped inside a 'closed' epoch boundary trigger invariant traps.
   - String mathematical parsing resolves IEEE 754 float drift via `BigInt` equivalents.
   - The final calculation ensures $\sum Debits \equiv \sum Credits$.
4. **Balance Verification:** The final reconstructed state is cross-checked against the snapshot's mathematical proofs.

## 3. End-to-End Rebuild Certification
M12 successfully wraps all previous milestones (M1–M11) into a single, unified execution cycle. Core domains including RBAC, Dues, Elections, Relief, Loans, and Ticketing process harmoniously against the unified F3 financial double-entry bridge. E2E simulated tests verify the entire ledger stays balanced and isolated.

**Status:** Certified under the Universal Adversarial Audit Standard. Ready for Milestone 13.
