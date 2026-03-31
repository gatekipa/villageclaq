-- Migration 00034: Drop unused fine_rules table
-- The fine_rules table has been replaced by the fine_types table (migration 00033).
-- No application code references fine_rules anymore.
-- NOTE: savings_cycles.fine_rules is a JSONB column, NOT this table — it is unaffected.

DROP TABLE IF EXISTS fine_rules CASCADE;
