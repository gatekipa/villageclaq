# LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1

**Status:** approved local catalog comparison contract  
**Date:** 2026-09-20  
**Raw hold (unchanged):** `F23_FINGERPRINT_MISMATCH`  
**Hosted:** DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN

This is **local catalog comparison only**. It does **not** establish role equivalence, restricted-role enforcement, or hosted authorization behavior. It does **not** authorize repair and does **not** satisfy hosted equality.

Implementation: `scripts/lib/f3-local-fingerprint-comparison.mjs`  
Shared raw comparator (unchanged): `fingerprintCompleteAndExact` in `scripts/lib/f3-db-push-repair-safety-gate.mjs`  
Retained capture: `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_FINGERPRINT_CAPTURE_LOCAL_20260920/CAPTURE_ATTEMPT_2/`

## Approve only these adjustments

1. **Identity first.** Exact schema / object kind / name and complete function-signature (`identity_arguments`) matching **before** any comparison adjustment. Changed identities or signatures are rejected.
2. **Creator remap.** Oracle creator `postgres` → local creator `ubuntu` in **owner, grantor, and owner-self grantee** fields only.
3. **No other principal mapping.** Do not map `authenticated`, `service_role`, or any other principal.
4. **Recognized omission.** The captured seven **non-grantable** `service_role` privilege omissions on exactly `public.financial_ledger_epochs`:
   DELETE, INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE.
5. **Envelope binding.** That exception is bound to the independently sealed platform-ACL envelope digest  
   `eb58900b492b95371decfdab86b3786afc2c8089c6b0a117497f9e0b22c41a2a`.  
   Missing or incorrect envelope identity rejects local acceptance.

## Reject everything else

Preserve privilege / grant-option distinctions, function definitions, `search_path`, SECURITY DEFINER flags, RLS enablement, and policies. Additional or missing ACL differences outside the recognized seven omissions are rejected.

## Reporting (do not collapse)

| Verdict | Meaning |
|---------|---------|
| Raw equality | Unchanged `fingerprintCompleteAndExact`. Captured local pair remains `F23_FINGERPRINT_MISMATCH`. |
| Local acceptance | Accepted only under this named profile after the rules above. |
| Hosted outstanding | Raw equality, repair-safety on raw fingerprints, authentic `POST_COMMIT_HISTORY_FAILURE`, CLI 2.117.0 filename-version repair, authenticated resulting state, hosted requalification. |

The local profile must **never** set `repairAuthorized` or `hostedEquality`.

## Derived fingerprints

Any reconstructed observed fingerprint is labeled **derived**. It must match the recorded canonical observed digest from CAPTURE_ATTEMPT_2. An offline reassessment is **not** a fresh PostgreSQL execution.

## What this contract is not

- Not hosted identity proof
- Not restricted-role or RLS authorization proof
- Not a fingerprint waiver for hosted / repair gates
- Not authorization to patch frozen SQL, grants, or the oracle
- Not a clean 00001–00117 replay and not production-equivalent
