# S0 Cut 2 Disposable Rehearsal — 2026-09-11 (remediation portability)

**Production:** never contacted. Project `llbnliixczcqfftxpsmb` not migrated.  
**Provider keys:** unset. Drain provider suppressed. Synthetic UUIDs and `+237…` / `@example.test` only.  
**00115 digest (unchanged):** `d196b89cefaa91d63fabf6f10ffb73e57b6762ef45d3ac1d93a28279e771706c`

## Exact portable command for the full DB-backed suite

Do **not** depend on `sudo -u postgres`. Set a local disposable URL, then run the frozen 17 scripts:

```bash
export CUT2_DISPOSABLE_DATABASE_URL=postgresql://postgres@localhost:5432/s0p0b_cut2_disposable
# Windows PowerShell:
# $env:CUT2_DISPOSABLE_DATABASE_URL="postgresql://postgres@localhost:5432/s0p0b_cut2_disposable"

npm run test:s0-cut2
```

Prerequisite: local empty-structural database `s0p0b_cut2_disposable` with fixture `scripts/_cut2_disposable_fixture.sql` and exact file `supabase/migrations/00115_s0_p0b_cut2_notification_queue.sql` applied via `psql -v ON_ERROR_STOP=1`. Not the full backlog runner. Never point the URL at production.

## Harness resolution (`scripts/_cut2_test_helpers.mjs`)

1. If `CUT2_DISPOSABLE_DATABASE_URL` is set → `psql -d $URL`. Rejects production host `llbnliixczcqfftxpsmb`.
2. Else detect a supported local disposable PostgreSQL (`psql` on PATH, default URL, host/user/port, Windows-practical PATH `psql`).
3. Optional detected path only: passwordless `sudo -n -u postgres` if it already works. Never assumed. Never used if sudo needs a password.
4. Else **fail clearly** with the exact export above. No silent skip. No false PASS.

Python rehearsal `scripts/_cut2_rehearsal.py` uses the same order.

## Prior qualification (unchanged 00115)

Local PostgreSQL 16 cluster, database `s0p0b_cut2_disposable`. Transaction COMMIT. 17/17 WA collisions PASS. ZERO sends.

## App / CI after remediation

- `npm run test:s0-cut2` → **17/17 scripts PASS** (21 node:test cases; email-send-410 is behavioral POST/GET + zero-side-effect spies, not regex-only)
- Historical notification producer + drain render suite:
  - **Previous baseline (do not overwrite):** **182/182 PASS, 0 fail**
  - **Erroneous prior evidence 186/186:** discarded
  - **New final total after 8 behavioral drain-render tests:** **190/190 PASS, 0 fail**
- `npm run build` → **PASS**
- Functional SHA for this drain-semantics fold: `3fccd4c18b77259f1f5bc3bb2997d353f43a64a5`
