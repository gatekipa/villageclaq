# F18 local PostgreSQL proof results

- Classification: `LOCAL_PG_EXECUTED`
- Server version: `17.11 (Ubuntu 17.11-1.pgdg24.04+2)`
- Checks: 24
- Scenarios: 9
- Executed transactions: 8
- Pass/fail: 33/0

Lock-wait cases bind waiter to the reset backend from the same generated-SQL connection.
Success cases reparse `interpretedCommitted:true` with CLEAN_BASELINE.
