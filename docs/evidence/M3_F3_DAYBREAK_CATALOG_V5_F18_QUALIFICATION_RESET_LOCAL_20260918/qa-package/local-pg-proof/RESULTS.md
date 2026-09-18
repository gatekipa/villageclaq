# F18 independent QA — local PostgreSQL proof

- Classification: `LOCAL_PG_EXECUTED`
- Server version: `17.11 (Ubuntu 17.11-1.pgdg24.04+2)`
- Checks: 24
- Scenarios: 9
- Executed transactions: 8
- Pass/fail: 33/0
- Reviewer: `bc-49cebacf-a8b4-5f38-9609-95ffe86d6adf`
- Reviewed pin: `ca2c0d536037da8c7f55627ac1694cacb932d1d7`

Lock-wait waiters bound to the reset backend from the same generated-SQL connection.
Success cases independently reparse `interpretedCommitted:true` with CLEAN_BASELINE.
