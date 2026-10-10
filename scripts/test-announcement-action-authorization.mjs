import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL('../src/lib/actions/communications.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const group = '99999999-9999-4999-8999-999999999999';
const author = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const recipient = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const departed = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function harness(overrides = {}) {
  const state = {
    user: { id: author }, activeMembership: true, allowed: true,
    rows: [
      { id: recipient, user_id: recipient, role: 'member', standing: 'good', is_proxy: false, membership_status: 'active', profiles: { preferred_locale: 'en' } },
      { id: departed, user_id: departed, role: 'member', standing: 'good', is_proxy: false, membership_status: 'exited', profiles: { preferred_locale: 'en' } },
      { id: author, user_id: author, role: 'owner', standing: 'good', is_proxy: false, membership_status: 'active', profiles: { preferred_locale: 'en' } },
      { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', user_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', role: 'member', standing: 'banned', is_proxy: false, membership_status: 'active', profiles: null },
    ],
    announcementWrites: [], publicationWrites: [], notifications: [], queued: [],
    enabled: { in_app: true, email: false, sms: false, whatsapp: false }, ...overrides,
  };
  const actor = {
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
    from: (table) => {
      assert.equal(table, 'memberships');
      return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: state.activeMembership ? { id: 'active-membership' } : null, error: null }) };
    },
    rpc: async (name) => { assert.equal(name, 'has_group_permission'); return { data: state.allowed, error: null }; },
  };
  const service = {
    from(table) {
      const q = { filters: [], payload: null,
        select() { return this; },
        eq(key, value) { this.filters.push([key, value]); return this; },
        in(key, values) { this.filters.push([key, values]); return this; },
        insert(payload) { this.payload = payload; this.operation = "insert"; return this; },
        update(payload) { this.payload = payload; this.operation = "update"; return this; },
        single: async () => {
          assert.equal(table, 'announcements');
          state.announcementWrites.push(q.payload);
          return { data: { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }, error: null };
        },
        then(resolve) {
          if (table === 'memberships') {
            const data = state.rows.filter((row) => q.filters.every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value || key === 'group_id'));
            return Promise.resolve(resolve({ data, error: null }));
          }
          if (table === 'announcements' && q.operation === 'update') {
            state.publicationWrites.push(q.payload);
            return Promise.resolve(resolve({ error: null }));
          }
          assert.equal(table, 'notifications');
          state.notifications.push(...q.payload);
          return Promise.resolve(resolve({ error: null }));
        },
      };
      return q;
    },
    rpc: async (name, args) => { assert.equal(name, 'queue_transactional_notification'); state.queued.push(args.p_command); return state.queueError ? { error: { message: 'queue unavailable' } } : { data: { queued: true }, error: null }; },
  };
  const exports = {};
  const localRequire = (id) => {
    if (id === '@/lib/supabase/server') return { createClient: async () => actor };
    if (id === '@supabase/supabase-js') return { createClient: () => service };
    if (id === '@/lib/notification-prefs') return { getEnabledChannels: async () => state.enabled };
    return require(id);
  };
  vm.runInNewContext(compiled, { exports, require: localRequire, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://isolated.example', SUPABASE_SERVICE_ROLE_KEY: 'test-only' } } });
  return { state, action: exports.createAnnouncementAction };
}

const input = { groupId: group, title: 'QA', body: 'Fictional', audienceType: 'all', channels: ['in_app'], createdBy: author };

test('untrusted author, missing membership, and denied permission never reach service writes', async () => {
  for (const change of [{ createdBy: departed }, { activeMembership: false }, { allowed: false }]) {
    const { createdBy, ...stateChange } = change;
    const h = harness(stateChange);
    await assert.rejects(h.action({ ...input, createdBy: createdBy ?? author }), /UNAUTHORIZED/);
    assert.equal(h.state.announcementWrites.length, 0);
    assert.equal(h.state.notifications.length, 0);
  }
});

test('authorized immediate announcement reaches only active, non-banned, non-sender member', async () => {
  const h = harness();
  const result = await h.action(input);
  assert.ok(result.id);
  assert.equal(h.state.announcementWrites.length, 1);
  assert.equal(h.state.announcementWrites[0].created_by, author);
  assert.equal(h.state.announcementWrites[0].sent_at, null);
  assert.equal(h.state.publicationWrites.length, 1);
  assert.deepEqual(h.state.notifications.map((n) => n.user_id), [recipient]);
  assert.equal(h.state.queued.length, 0);
});

test('scheduled announcement writes no recipient or queue rows before its due time', async () => {
  const h = harness();
  await h.action({ ...input, scheduledAt: '2099-01-01T00:00:00Z' });
  assert.equal(h.state.announcementWrites.length, 1);
  assert.equal(h.state.notifications.length, 0);
  assert.equal(h.state.queued.length, 0);
});
test('disabled external channel is not queued and a queue failure leaves the row unpublished', async () => {
  const disabled = harness();
  await disabled.action({ ...input, channels: ['in_app', 'email'] });
  assert.equal(disabled.state.queued.length, 0);
  assert.equal(disabled.state.publicationWrites.length, 1);

  const failed = harness({ enabled: { in_app: true, email: true, sms: false, whatsapp: false }, queueError: true });
  await assert.rejects(failed.action({ ...input, channels: ['email'] }), /ANNOUNCEMENT_QUEUE_FAILED/);
  assert.equal(failed.state.announcementWrites.length, 1);
  assert.equal(failed.state.announcementWrites[0].sent_at, null);
  assert.equal(failed.state.publicationWrites.length, 0);
});
