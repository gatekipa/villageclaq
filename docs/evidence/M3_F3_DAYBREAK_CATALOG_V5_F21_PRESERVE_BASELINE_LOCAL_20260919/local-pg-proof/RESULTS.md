# F21 local PostgreSQL proof (tip-bound)

Classification: **LOCAL_PG_EXECUTED**
Prove HEAD: `3fe7314ab7cfb2abbcd66d8eb09f26ba2ed0a9e0` (equals functional tip)
Server: 17.11 (Ubuntu 17.11-1.pgdg24.04+2)
Checks: 30  Scenarios: 12  Executed TX: 9
Pass/fail: 42/0
overallOk: true

Preserve TX (`F21_TX_PRESERVE_EXTENSION_AND_MEMBERS`):
- before: btree_gist + 264 deptype='e' members; 188 typed captured members
- after: btree_gist + 264 deptype='e' members; leftovers/history removed
- verdict: QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1

Qual-from-00118 preinstalled extension: f3_[REDACTED_DB] HOLD; extension remains.

Hosted 188: CANNOT CONFIRM. No hosted/disposable contact.

DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT
