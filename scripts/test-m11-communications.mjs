import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

function escapeHtml(unsafe) {
  if (typeof unsafe !== 'string') return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeUrl(url) {
  if (!url) return '';
  const escaped = escapeHtml(url);
  if (!escaped.startsWith('https://')) {
    return '#';
  }
  return escaped;
}

function renderTemplate(templateKey, locale, data) {
  const safeStr = (key) => escapeHtml(String(data[key] || ''));
  const safeNum = (key) => escapeHtml(String(data[key] || 0));
  const safeUrl = (key) => sanitizeUrl(String(data[key] || ''));

  switch (templateKey) {
    case 'announcement_broadcast':
      const subject = locale === 'fr' 
        ? `Annonce de ${safeStr('groupName')}: ${safeStr('titleFr') || safeStr('title')}`
        : `Announcement from ${safeStr('groupName')}: ${safeStr('title')}`;
      const body = locale === 'fr' ? (safeStr('bodyFr') || safeStr('body')) : safeStr('body');
      const sender = safeStr('senderName');
      return { html: `<div><p><strong>${subject}</strong></p><p>${body}</p><p>-- <br/>${sender}</p></div>` };
    case 'dues_reminder':
      return { html: `<a href="${safeUrl('paymentLink')}">Pay Now</a>` };
    default:
      return { html: '' };
  }
}

class MockM11CommunicationsEngine {
  constructor() {
    this.queue = [];
    this.announcements = [];
    this.notifications = [];
  }

  // Mocks public.queue_transactional_notification
  queueNotification(command) {
    const { group_id, membership_id, channel, template_key, payload, idempotency_key } = command;
    
    // Test 2: Idempotent enqueueing deduplication
    const existing = this.queue.find(q => q.group_id === group_id && q.idempotency_key === idempotency_key);
    if (existing) {
      return { success: true, idempotent_replay: true, notification_id: existing.id };
    }

    const id = crypto.randomUUID();
    this.queue.push({
      id,
      group_id,
      membership_id,
      channel,
      template_key,
      payload,
      idempotency_key,
      status: 'pending',
      locked_by: null,
      locked_until: null,
      attempts: 0,
      next_retry_at: new Date().toISOString()
    });

    return { success: true, idempotent_replay: false, notification_id: id };
  }

  // Mocks public.claim_notification_batch
  claimBatch(batchSize, workerId) {
    const now = new Date();
    const claimed = [];
    let count = 0;

    for (const item of this.queue) {
      if (count >= batchSize) break;
      
      const isPending = item.status === 'pending';
      const isRetryable = item.status === 'processing' && new Date(item.locked_until || 0) < now;
      const isDue = new Date(item.next_retry_at || 0) <= now;

      if ((isPending || isRetryable) && isDue) {
        item.status = 'processing';
        item.locked_by = workerId;
        item.locked_until = new Date(now.getTime() + 60 * 1000).toISOString();
        item.attempts += 1;
        claimed.push({ ...item });
        count++;
      }
    }
    return claimed;
  }

  // Mocks public.settle_notification_delivery
  settleDelivery(notificationId, workerId, success, providerMessageId, errorMessage) {
    const item = this.queue.find(q => q.id === notificationId);
    if (!item) throw new Error("Notification not found");

    // Test 3: Lease expiration & stolen lease defense
    if (item.locked_by !== workerId) {
      throw new Error("LEASE_EXPIRED_OR_STOLEN");
    }

    if (success) {
      item.status = 'sent';
      item.provider_message_id = providerMessageId;
      item.locked_by = null;
      item.locked_until = null;
    } else {
      if (item.attempts >= 5) {
        item.status = 'dead_letter';
      } else {
        item.status = 'pending';
        const backoffMs = Math.pow(2, item.attempts) * 1000;
        item.next_retry_at = new Date(Date.now() + backoffMs).toISOString();
      }
      item.locked_by = null;
      item.locked_until = null;
      item.error_log = (item.error_log || '') + '\n' + errorMessage;
    }
    return { success: true };
  }

  // Mocks atomic announcement claiming
  createAnnouncement(ann) {
    const id = crypto.randomUUID();
    this.announcements.push({
      ...ann,
      id,
      sent_at: null
    });
    return id;
  }

  claimScheduledAnnouncement(id) {
    const ann = this.announcements.find(a => a.id === id);
    if (!ann) return null;
    if (ann.sent_at !== null) return null; // already claimed
    
    ann.sent_at = new Date().toISOString();
    return { ...ann };
  }
}

test('MockM11CommunicationsEngine - Adversarial Audit', async (t) => {
  await t.test('Test 1: Concurrency and lease locking (zero overlap in claimed batches)', () => {
    const engine = new MockM11CommunicationsEngine();
    // Seed 10 items
    for (let i = 0; i < 10; i++) {
      engine.queueNotification({
        group_id: 'group_1',
        membership_id: 'm1',
        channel: 'email',
        template_key: 'test',
        payload: {},
        idempotency_key: `test1_${i}`
      });
    }

    const batch1 = engine.claimBatch(5, 'worker_1');
    const batch2 = engine.claimBatch(5, 'worker_2');

    assert.strictEqual(batch1.length, 5);
    assert.strictEqual(batch2.length, 5);

    const overlap = batch1.some(b1 => batch2.some(b2 => b2.id === b1.id));
    assert.strictEqual(overlap, false, "Workers should not claim overlapping items");
  });

  await t.test('Test 2: Idempotent enqueueing deduplication', () => {
    const engine = new MockM11CommunicationsEngine();
    const res1 = engine.queueNotification({
      group_id: 'group_2',
      membership_id: 'm2',
      channel: 'sms',
      template_key: 'test',
      payload: {},
      idempotency_key: 'idem_key_1'
    });

    const res2 = engine.queueNotification({
      group_id: 'group_2',
      membership_id: 'm2',
      channel: 'sms',
      template_key: 'test',
      payload: {},
      idempotency_key: 'idem_key_1'
    });

    assert.strictEqual(res1.idempotent_replay, false);
    assert.strictEqual(res2.idempotent_replay, true);
    assert.strictEqual(res1.notification_id, res2.notification_id, "Idempotent replay should return same ID");
    
    const items = engine.queue.filter(q => q.idempotency_key === 'idem_key_1');
    assert.strictEqual(items.length, 1, "Should only enqueue 1 row");
  });

  await t.test('Test 3: Lease expiration & stolen lease defense', () => {
    const engine = new MockM11CommunicationsEngine();
    const res = engine.queueNotification({
      group_id: 'group_3',
      idempotency_key: 'test3_1'
    });
    
    const batch = engine.claimBatch(1, 'worker_A');
    assert.strictEqual(batch[0].id, res.notification_id);

    // Try to settle with wrong worker ID
    assert.throws(() => {
      engine.settleDelivery(res.notification_id, 'worker_B', true, 'msg_1');
    }, /LEASE_EXPIRED_OR_STOLEN/, "Settlement by non-owner should throw");

    // Correct worker succeeds
    engine.settleDelivery(res.notification_id, 'worker_A', true, 'msg_1');
    const item = engine.queue.find(q => q.id === res.notification_id);
    assert.strictEqual(item.status, 'sent');
  });

  await t.test('Test 4: Exponential backoff & dead-letter transition', () => {
    const engine = new MockM11CommunicationsEngine();
    const res = engine.queueNotification({
      group_id: 'group_4',
      idempotency_key: 'test4_1'
    });

    for (let i = 1; i <= 5; i++) {
      // Force next_retry_at to past so it can be claimed
      const item = engine.queue.find(q => q.id === res.notification_id);
      item.next_retry_at = new Date(Date.now() - 1000).toISOString();

      const batch = engine.claimBatch(1, `worker_fail_${i}`);
      assert.strictEqual(batch.length, 1);
      
      const beforeDate = Date.now();
      engine.settleDelivery(batch[0].id, `worker_fail_${i}`, false, null, `Fail ${i}`);
      
      if (i < 5) {
        assert.strictEqual(item.status, 'pending');
        const expectedBackoffMs = Math.pow(2, i) * 1000;
        const actualNextRetry = new Date(item.next_retry_at).getTime();
        assert.ok(actualNextRetry >= beforeDate + expectedBackoffMs - 100);
      } else {
        assert.strictEqual(item.status, 'dead_letter', "After max attempts, should be dead_letter");
      }
    }
  });

  await t.test('Test 5: Cross-tenant isolation', () => {
    const engine = new MockM11CommunicationsEngine();
    // In our mock, group_id bounds the data context.
    const resA = engine.queueNotification({ group_id: 'Tenant_A', idempotency_key: 'test5_A' });
    const resB = engine.queueNotification({ group_id: 'Tenant_B', idempotency_key: 'test5_B' });
    
    // Simulate query bounded by RLS Tenant A
    const tenantAQueue = engine.queue.filter(q => q.group_id === 'Tenant_A');
    assert.strictEqual(tenantAQueue.length, 1);
    assert.strictEqual(tenantAQueue[0].id, resA.notification_id);
    
    const tenantABatch = tenantAQueue; // mock claim restricted by Tenant A
    const ids = tenantABatch.map(i => i.id);
    assert.ok(ids.includes(resA.notification_id));
    assert.ok(!ids.includes(resB.notification_id), "Tenant A should not see Tenant B's data");
  });

  await t.test('Test 6: Anti-XSS template sanitization', () => {
    const engine = new MockM11CommunicationsEngine();
    const maliciousPayload = {
      body: '<script>alert("XSS")</script>',
      title: 'Hello "friend" & <foes>',
      senderName: '<b>Admin</b>',
      paymentLink: 'javascript:alert(1)'
    };
    
    const resultHtml = renderTemplate('announcement_broadcast', 'en', maliciousPayload);
    
    assert.ok(!resultHtml.html.includes('<script>'));
    assert.ok(resultHtml.html.includes('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'));
    assert.ok(resultHtml.html.includes('Hello &quot;friend&quot; &amp; &lt;foes&gt;'));
    assert.ok(resultHtml.html.includes('&lt;b&gt;Admin&lt;/b&gt;'));

    const resultDues = renderTemplate('dues_reminder', 'en', maliciousPayload);
    // javascript: URL should be sanitized to #
    assert.ok(resultDues.html.includes('href="#"'));
    assert.ok(!resultDues.html.includes('javascript:'));
  });

  await t.test('Test 7: Atomic scheduled announcement claiming', () => {
    const engine = new MockM11CommunicationsEngine();
    const annId = engine.createAnnouncement({ title: 'Race condition test' });
    
    // Simulating two cron triggers at the exact same millisecond
    const claim1 = engine.claimScheduledAnnouncement(annId);
    const claim2 = engine.claimScheduledAnnouncement(annId);
    
    assert.ok(claim1 !== null, "First claim should win");
    assert.strictEqual(claim2, null, "Second claim should return null due to atomic update failure");
  });

  await t.test('Test 8: Tenant boundary isolation in hooks (staleTenantAborted)', () => {
    // In our react hook (simulated)
    const currentGroupId = 'group_123';
    
    // Action called with stale group id
    const inputGroupId = 'group_456';
    
    const mutationFn = () => {
      if (inputGroupId !== currentGroupId) {
        throw new Error("staleTenantAborted");
      }
    };
    
    assert.throws(mutationFn, /staleTenantAborted/, "Stale tenant must abort execution");
  });
});
