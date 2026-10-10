import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL('../src/app/api/cron/send-scheduled-announcements/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const group = '99999999-9999-4999-8999-999999999999';
const recipient = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function harness(overrides = {}) {
  const state = {
    emailEnabled: true, queueError: false, queued: [], released: false,
    sentAt: null, notifications: [],
    rows: [
      { id: recipient, user_id: recipient, role: 'member', is_proxy: false, standing: 'good', membership_status: 'active', profiles: { preferred_locale: 'en' } },
      { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', user_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', role: 'member', is_proxy: false, standing: 'good', membership_status: 'exited', profiles: { preferred_locale: 'en' } },
    ],
    ...overrides,
  };
  const service = {
    from(table) {
      const q = {
        mode: 'select', payload: null, filters: [],
        select() { return this; },
        update(payload) { this.mode = 'update'; this.payload = payload; return this; },
        insert(payload) { this.mode = 'insert'; this.payload = payload; return this; },
        eq(key, value) { this.filters.push([key, value]); return this; },
        is() { return this; }, not() { return this; }, lte() { return this; },
        order() { return this; }, limit() { return this; }, in() { return this; },
        single: async () => {
          assert.equal(table, 'announcements');
          assert.equal(q.mode, 'update');
          state.sentAt = q.payload.sent_at;
          return { data: { id, group_id: group, title: 'QA', content: 'Fictional', channels: ['email'], audience: { type: 'all' }, sent_at: state.sentAt }, error: null };
        },
        then(resolve) {
          if (table === 'announcements' && q.mode === 'select') return Promise.resolve(resolve({ data: [{ id }], error: null }));
          if (table === 'announcements' && q.mode === 'update') {
            state.released = q.payload.sent_at === null;
            state.sentAt = q.payload.sent_at;
            return Promise.resolve(resolve({ error: null }));
          }
          if (table === 'memberships') {
            const data = state.rows.filter((row) => q.filters.every(([key, value]) => key === 'group_id' || row[key] === value));
            return Promise.resolve(resolve({ data, error: null }));
          }
          if (table === 'notifications' && q.mode === 'insert') {
            state.notifications.push(...q.payload);
            return Promise.resolve(resolve({ error: null }));
          }
          throw new Error(`Unexpected ${table}/${q.mode}`);
        },
      };
      return q;
    },
    rpc: async (name, args) => {
      assert.equal(name, 'queue_transactional_notification');
      state.queued.push(args.p_command);
      return state.queueError ? { error: { message: 'queue unavailable' } } : { data: { queued: true }, error: null };
    },
  };
  const exports = {};
  const localRequire = (name) => {
    if (name === 'next/server') return { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } };
    if (name === '@supabase/supabase-js') return { createClient: () => service };
    if (name === '@/lib/notification-prefs') return { getEnabledChannels: async () => ({ in_app: true, email: state.emailEnabled, sms: false, whatsapp: false, push: false }) };
    return require(name);
  };
  vm.runInNewContext(compiled, { exports, require: localRequire, process: { env: { CRON_SECRET: 'test', NEXT_PUBLIC_SUPABASE_URL: 'https://isolated.example', SUPABASE_SERVICE_ROLE_KEY: 'test-only' } }, console });
  return { state, run: () => exports.GET({ headers: { get: () => 'Bearer test' } }) };
}

test('scheduled fanout excludes exited member and skips opted-out external channel', async () => {
  const h = harness({ emailEnabled: false });
  const response = await h.run();
  assert.equal(response.body.failed, 0);
  assert.equal(h.state.queued.length, 0);
  assert.equal(h.state.released, false);
});

test('scheduled queue failure is reported and releases claim for retry', async () => {
  const h = harness({ queueError: true });
  const response = await h.run();
  assert.equal(response.body.succeeded, 0);
  assert.equal(response.body.failed, 1);
  assert.equal(h.state.queued.length, 1);
  assert.equal(h.state.queued[0].membership_id, recipient);
  assert.equal(h.state.released, true);
  assert.equal(h.state.sentAt, null);
});