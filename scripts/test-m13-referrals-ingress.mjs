import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

class MockM13Engine {
  constructor() {
    this.memberships = [];
    this.referrals = [];
    this.notifications = [];
  }

  generateGroupReferralLink(groupId, targetOrgType, authUid) {
    const mem = this.memberships.find(m => m.group_id === groupId && m.user_id === authUid && m.status === 'active');
    if (!mem) throw new Error('UNAUTHORIZED');

    const token = crypto.randomBytes(16).toString('hex');
    this.referrals.push({
      id: crypto.randomUUID(),
      referrer_group_id: groupId,
      referrer_member_id: mem.id,
      token,
      target_organization_type: targetOrgType,
      status: 'issued',
      activated_group_id: null
    });

    return { token, share_url: `https://villageclaq.com/onboard?ref=${token}` };
  }

  claimGroupReferral(token, newGroupId) {
    const ref = this.referrals.find(r => r.token === token);
    if (!ref) throw new Error('INVALID_TOKEN');
    if (ref.status !== 'issued') {
      if (ref.status === 'claimed' && ref.activated_group_id === newGroupId) {
        return { success: true, status: 'claimed' }; 
      }
      throw new Error('INVALID_STATUS');
    }

    ref.status = 'claimed';
    ref.activated_group_id = newGroupId;

    this.notifications.push({
      group_id: ref.referrer_group_id,
      payload: { type: 'referral_claimed' }
    });

    return { success: true, status: 'claimed' };
  }

  recordGroupActivation(groupId) {
    const ref = this.referrals.find(r => r.activated_group_id === groupId && r.status === 'claimed');
    if (ref) {
      ref.status = 'activated';
      this.notifications.push({
        group_id: ref.referrer_group_id,
        payload: { type: 'referral_activated' }
      });
    }
  }
}

test('M13 Referrals Ingress Engine', async (t) => {
  const engine = new MockM13Engine();
  engine.memberships.push({ id: 'mem_1', group_id: 'group_A', user_id: 'uid_1', status: 'active' });
  engine.memberships.push({ id: 'mem_2', group_id: 'group_A', user_id: 'uid_2', status: 'suspended' });

  let validToken = '';

  await t.test('Test 1: Token Generation & Idempotency', () => {
    assert.throws(() => engine.generateGroupReferralLink('group_A', null, 'uid_2'), /UNAUTHORIZED/);
    
    const result = engine.generateGroupReferralLink('group_A', 'nonprofit', 'uid_1');
    assert.ok(result.token);
    assert.ok(result.share_url);
    validToken = result.token;
  });

  await t.test('Test 2: Privacy Isolation', () => {
    const publicPayload = engine.generateGroupReferralLink('group_A', 'school', 'uid_1');
    assert.strictEqual(publicPayload.group_id, undefined);
    assert.strictEqual(publicPayload.member_id, undefined);
    assert.strictEqual(publicPayload.finances, undefined);
  });

  await t.test('Test 3: Cross-Tenant Boundary', () => {
    assert.throws(() => engine.generateGroupReferralLink('group_B', null, 'uid_1'), /UNAUTHORIZED/);
  });

  await t.test('Test 4: Activation State Machine', () => {
    const res = engine.claimGroupReferral(validToken, 'group_C');
    assert.strictEqual(res.status, 'claimed');

    const res2 = engine.claimGroupReferral(validToken, 'group_C');
    assert.strictEqual(res2.status, 'claimed');

    assert.throws(() => engine.claimGroupReferral(validToken, 'group_D'), /INVALID_STATUS/);

    engine.recordGroupActivation('group_C');
    const ref = engine.referrals.find(r => r.token === validToken);
    assert.strictEqual(ref.status, 'activated');

    assert.strictEqual(engine.notifications.filter(n => n.group_id === 'group_A').length, 2);
  });
});
