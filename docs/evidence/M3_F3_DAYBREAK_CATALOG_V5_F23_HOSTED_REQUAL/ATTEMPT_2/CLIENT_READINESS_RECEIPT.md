# CLIENT_READINESS_RECEIPT — F23 HOSTED REQUAL ATTEMPT_2

**Overall: READY**  
**Generated:** 2026-09-20T08:26:32.051Z (UTC; box local America/New_York)  
**Connection-free:** true — no database connect attempted  
**Execution HEAD:** `66be2b4797515975d737a0fd66656bc4c0de2145`

## Required checks (same Node process / PATH as runner)

| Check | Result | Detail |
|-------|--------|--------|
| PATH_has_/usr/bin | PASS | /usr/bin:/home/box/.local/bin:/usr/bin:/home/box/.local/bin:/usr/bin:/home/box/.local/bin:/usr/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/local/games:/usr/games |
| PATH_has_local_bin | PASS | /usr/bin:/home/box/.local/bin:/usr/bin:/home/box/.local/bin:/usr/bin:/home/box/.local/bin:/usr/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/home/box/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/local/games:/usr/games |
| psql_spawnSync_version | PASS | status=0 stdout=psql (PostgreSQL) 17.11 (Debian 17.11-0+deb13u1) stderr= which=/usr/bin/psql |
| supabase_version_exact | PASS | status=0 version="2.117.0" |
| evidence_dirs_creatable | PASS | /workspace/villageclaq-f23-hosted-attempt2/repo/docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_HOSTED_REQUAL/ATTEMPT_2/hosted/qualification-reset: creatable; /workspace/villageclaq-f23-hosted-attempt2/repo/docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_HOSTED_REQUAL/ATTEMPT_2/hosted/qualify-from-00118: creatable; /workspace/villageclaq-f23-hosted-attempt2/repo/docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_HOSTED_REQUAL_ATTEMPT_2_20260920: creatable |
| git_HEAD_functional_tip | PASS | HEAD=66be2b4797515975d737a0fd66656bc4c0de2145 |
| plan_sha256 | PASS | path=/workspace/villageclaq-f23-hosted-attempt2/repo/docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_PROPOSED_HOSTED_REQUAL_PLAN_20260920/PROPOSED_HOSTED_REQUAL_PLAN.md sha=bf9ca7b6c408d72b9f1231f223628a41e77fe275132acf273cd5386dd8c3b138 |
| closureDigest | PASS | runtime=b276d0cb9b39efd10f67422948b4cf9a6353359c116ab657d379c7c7f467a211 count=47 |
| scopeSqlIdentitySha256 | PASS | scope=d95d96e02a3a1844977d852fa23a64f742b79b5f767984b6a2d4512cbe02632f |
| env_DB_PASSWORD | PASS | present-or-missing |
| env_MGMT_TOKEN | PASS | present-or-missing |
| env_SENTINEL | PASS | present-or-missing |
| env_REMOTE_DESTRUCTIVE | PASS | 1 |
| debian_psql_packages | PASS | libpq5 17.11-0+deb13u1 install ok installed / postgresql-client 17+278 install ok installed / postgresql-client-17 17.11-0+deb13u1 install ok installed / postgresql-client-common 278 install ok installed |

## Client install (pre-provisioned; not reinstalled)

- Source: Debian official `http://deb.debian.org/debian` trixie/main
- Packages: libpq5 17.11-0+deb13u1 install ok installed; postgresql-client 17+278 install ok installed; postgresql-client-17 17.11-0+deb13u1 install ok installed; postgresql-client-common 278 install ok installed
- psql: `/usr/bin/psql` — `psql (PostgreSQL) 17.11 (Debian 17.11-0+deb13u1)`
- supabase: `/home/box/.local/bin/supabase` — `2.117.0`
- PATH includes `/usr/bin` and `/home/box/.local/bin`
- Installation excluded server/Docker/WSL — client only

## Pins verified

- Functional HEAD: `66be2b4797515975d737a0fd66656bc4c0de2145` (match)
- Plan SHA-256: `bf9ca7b6c408d72b9f1231f223628a41e77fe275132acf273cd5386dd8c3b138` (match)
- closureDigest: `b276d0cb9b39efd10f67422948b4cf9a6353359c116ab657d379c7c7f467a211` (match)
- scopeSqlIdentitySha256: `d95d96e02a3a1844977d852fa23a64f742b79b5f767984b6a2d4512cbe02632f` (match)
- Target ONLY: `jkorwnwwmdeflfntxntl` (forbid production `llbnliixczcqfftxpsmb`; reject :6543)

## Credentials (presence only; values never printed)

- VILLAGECLAQ_F3_DISPOSABLE_DB_PASSWORD: present
- VILLAGECLAQ_F3_DISPOSABLE_MGMT_TOKEN: present
- F3_DBPUSH_DISPOSABLE_SENTINEL: present
- F3_REMOTE_DESTRUCTIVE_TEST: 1

## Gate decision

READY — authorized to consume at most ONE constrained preserve-reset and (if reset+gates pass) ONE complete qualification 00118–00123.

Known labeling limitation (inherited): qualify-result.json may still carry stale F19 label text; no executable correction authorized.
