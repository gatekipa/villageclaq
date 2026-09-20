# Offline test result — LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1

**Not a fresh PostgreSQL execution.** Database transports were not used. No full prove run.

Command:

```
node --test --test-name-pattern='F23 local|F23 hosted' scripts/test-f3-qualification-reset.mjs
```

Result: **7/7 pass** (focused local-acceptance tests). Existing F23 mode/probe/history tests also pass when included (10/10 with those three).

| Test | Result |
|------|--------|
| Accept retained capture; raw remains `F23_FINGERPRINT_MISMATCH`; exercise prove-helper reporting path | PASS |
| Reject changed identities / signatures / arbitrary role mappings | PASS |
| Reject privilege, grant-option, extra or missing ACL diffs | PASS |
| Reject function definition, SECURITY DEFINER, search_path, RLS drift | PASS |
| Reject missing or incorrect envelope identity | PASS |
| Hosted/repair paths still reject the raw captured mismatch | PASS |
| Repair amendment keeps atomic refusal fail-closed; no repair authorization | PASS |

Derived observed fingerprints matched recorded CAPTURE_ATTEMPT_2 canonical digests.

QA slot: empty — VillageClaq QA not requested this turn.  
Astra: UNAVAILABLE — NO VERDICT.
