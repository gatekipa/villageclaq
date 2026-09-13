-- Shared fail-closed pin checks for M3 F3 forward migrations.
-- Included by 00118–00123 via scripts/generate-f3-forward-migrations.py (inlined).
-- Generator places this pin, HGP postconditions, owner/ACL/RESET ROLE, and
-- the sole final COMMIT in one transaction. NOT a standalone migration.

-- has_group_permission: Cut 1 / M2 3-arg identity. CALL only; never CREATE OR REPLACE.
