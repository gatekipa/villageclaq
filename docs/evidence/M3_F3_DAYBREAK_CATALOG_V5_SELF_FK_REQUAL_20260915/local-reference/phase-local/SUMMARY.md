# Phase local — Catalog-V5 self-FK RI roles

**Verdict: READY_TO_FF**

- PG 17.6 primary ≡ independent ≡ tip ≡ cloud V5 for all six
- Partitions reconcile exactly with required table (reproduced from 17.6 structured records)
- Self-FK RI roles via RI function (not relation equality); internal_fk = referencing + referenced
- Envelope `eb58900b…`; module `3742c039…`; schema `f3-full-catalog-v5`
- tip vs E4: exactly 4 allowlisted files
- npm test:f3-db-push 125/124/0/1; tsc 0; build 0
- Env-dependent: test-s0-cut2 classified, not PASS
