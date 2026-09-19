# M3_F3_DAYBREAK_CATALOG_V5_SELF_FK_REQUAL_20260915

## Verdict: HOLD (hosted terminal poison target binding)

### Local PG 17.6
- READY_TO_FF: primary ≡ independent ≡ tip ≡ cloud V5 for all six
- Partitions reproduced from 17.6 structured records match required table
- Self-FK RI roles via RI function (not relation equality); internal_fk = referencing + referenced
- Schema `f3-full-catalog-v5`; envelope `eb58900b…`; module `3742c039…`

### Functional commits
- F5 `228549412cf3…` parent E4; exactly 4 tip blobs from #100
- F5.1 `55995cf0ab5f…` parent F5; POISON_ABSENT_PROBE_SQL adds current_database()/current_user
- #84/#85/#86 OPEN DRAFT at F5.1; #96–#100 untouched open draft

### Hosted (one reset only)
- Identity jkorwnwwmdeflfntxntl exact; CLEAN_BASELINE; floor label documented
- All six fingerprints exact equality after repair/retry/continuation
- HOLD: tip F5 poison probe omitted live database_name/user → fail-closed authenticated binding
- No second reset; no second hosted retry; F5.1 offline fix not hosted-requalified this run

### Supersession
- New evidence dir only; prior V3/V4 dirs unmodified; V4 not relabeled PASS
- d692 + d802 both superseded by V5 00123 `d5e50fd7…`
