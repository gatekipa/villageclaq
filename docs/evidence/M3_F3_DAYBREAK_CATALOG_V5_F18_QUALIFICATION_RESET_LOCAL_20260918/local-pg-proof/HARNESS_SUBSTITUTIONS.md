# Harness substitutions

Lock-wait cases execute committed generated SQL through shared `runQualificationReset` + local-fixture psql.
Reset backend identity is emitted from the same connection (`pg_backend_pid()` + NOTICE).
No disabled-adapter substitution is used for LOCAL_PG_EXECUTED cases.
