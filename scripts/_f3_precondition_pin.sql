-- Shared fail-closed pin checks for M3 F3 forward migrations.
-- Included by 00118–00123 via scripts/generate-f3-forward-migrations.py (inlined).
-- NOT a migration. DO NOT APPLY TO PRODUCTION as a standalone file.

-- has_group_permission: Cut 1 / M2 3-arg identity. CALL only; never CREATE OR REPLACE.
