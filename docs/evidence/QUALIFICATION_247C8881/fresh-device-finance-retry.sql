-- Candidate 247c8881, isolated PostgreSQL 17 F3 stub floor through 00120.
-- Representative manual money-in retry after an unobserved successful response.
-- The second command uses a new request_id, as a fresh tab or device does.
-- No fixture changes persist: the entire probe rolls back.
BEGIN;

INSERT INTO public.groups (id, currency)
VALUES ('00000000-0000-4000-8000-000000000001', 'USD');
INSERT INTO public.profiles (id)
VALUES ('00000000-0000-4000-8000-000000009001');
INSERT INTO public.memberships (id, group_id, user_id, role)
VALUES ('00000000-0000-4000-8000-000000009101',
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000009001', 'member');
INSERT INTO public.group_positions (id, group_id, title)
VALUES ('00000000-0000-4000-8000-000000009201',
        '00000000-0000-4000-8000-000000000001', 'Treasurer');
INSERT INTO public.position_assignments (membership_id, position_id)
VALUES ('00000000-0000-4000-8000-000000009101',
        '00000000-0000-4000-8000-000000009201');
INSERT INTO public.position_permissions (position_id, permission)
VALUES ('00000000-0000-4000-8000-000000009201', 'finances.manage');

INSERT INTO public.financial_ledger_epochs
  (id, group_id, currency, effective_from, source_kind, approval_note)
VALUES ('00000000-0000-4000-8000-000000000021',
        '00000000-0000-4000-8000-000000000001', 'USD',
        '2026-01-01T00:00:00Z', 'cutover', 'Isolated qualification fixture');
INSERT INTO public.financial_accounts
  (id, group_id, opened_ledger_epoch_id, currency, name, kind, opened_at)
VALUES ('00000000-0000-4000-8000-000000000101',
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000021', 'USD',
        'Fixture bank', 'bank', '2026-01-01T00:00:00Z');
INSERT INTO public.financial_funds (id, group_id, name, is_default)
VALUES ('00000000-0000-4000-8000-000000000201',
        '00000000-0000-4000-8000-000000000001', 'General', true);
INSERT INTO public.financial_categories (id, group_id, name, category_class)
VALUES ('00000000-0000-4000-8000-000000000301',
        '00000000-0000-4000-8000-000000000001', 'Donation', 'income');

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000009001';

SELECT public.post_financial_command('{"action":"money_in","group_id":"00000000-0000-4000-8000-000000000001","request_id":"00000000-0000-4000-8000-000000000601","occurred_at":"2026-09-08T12:00:00Z","amount":"500.00","currency":"USD","account_id":"00000000-0000-4000-8000-000000000101","fund_id":"00000000-0000-4000-8000-000000000201","category_id":"00000000-0000-4000-8000-000000000301"}'::jsonb) AS initial_post;
SELECT public.post_financial_command('{"action":"money_in","group_id":"00000000-0000-4000-8000-000000000001","request_id":"00000000-0000-4000-8000-000000000601","occurred_at":"2026-09-08T12:00:00Z","amount":"500.00","currency":"USD","account_id":"00000000-0000-4000-8000-000000000101","fund_id":"00000000-0000-4000-8000-000000000201","category_id":"00000000-0000-4000-8000-000000000301"}'::jsonb) AS same_request_retry;
SELECT public.post_financial_command('{"action":"money_in","group_id":"00000000-0000-4000-8000-000000000001","request_id":"00000000-0000-4000-8000-000000000602","occurred_at":"2026-09-08T12:00:00Z","amount":"500.00","currency":"USD","account_id":"00000000-0000-4000-8000-000000000101","fund_id":"00000000-0000-4000-8000-000000000201","category_id":"00000000-0000-4000-8000-000000000301"}'::jsonb) AS fresh_device_retry;

RESET ROLE;
SELECT count(*) AS event_count FROM public.financial_events;
SELECT count(*) AS posting_count FROM public.financial_postings;
ROLLBACK;
