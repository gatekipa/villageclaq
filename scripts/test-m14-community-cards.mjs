import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

class MockM14Engine {
  constructor() {
    this.groups = [
      { id: 'group_A', name: 'Alpha Org', allow_public_cards: true },
      { id: 'group_B', name: 'Beta Org', allow_public_cards: false }
    ];
    this.memberships = [
      { id: 'mem_1', group_id: 'group_A', user_id: 'uid_1', status: 'active', display_name: 'Alice', phone: '123', internal_id: 'uuid-123' },
      { id: 'mem_2', group_id: 'group_B', user_id: 'uid_2', status: 'active', display_name: 'Bob', phone: '456', internal_id: 'uuid-456' }
    ];
    this.cards = [];
  }

  issueShareCard(groupId, authUid, cardType) {
    const mem = this.memberships.find(m => m.group_id === groupId && m.user_id === authUid && m.status === 'active');
    if (!mem) throw new Error('UNAUTHORIZED');

    const group = this.groups.find(g => g.id === groupId);
    if (!group.allow_public_cards) throw new Error('FORBIDDEN');

    const token = crypto.randomBytes(16).toString('hex');
    const displayData = {
      organization_name: group.name,
      member_display_name: mem.display_name,
      issued_at: new Date().toISOString(),
      card_type: cardType
    };

    const card = {
      id: crypto.randomUUID(),
      group_id: groupId,
      member_id: mem.id,
      card_type: cardType,
      share_token: token,
      display_data: displayData,
      revoked: false
    };

    this.cards.push(card);
    return { token, display_data: displayData, id: card.id };
  }

  verifyPublicToken(token) {
    const card = this.cards.find(c => c.share_token === token);
    if (!card) return { valid: false, reason: 'not_found' };
    if (card.revoked) return { valid: false, reason: 'revoked' };
    
    return {
      valid: true,
      organization_name: card.display_data.organization_name,
      member_display_name: card.display_data.member_display_name,
      issued_at: card.display_data.issued_at,
      card_type: card.display_data.card_type
    };
  }

  revokeShareCard(groupId, authUid, cardId) {
    const mem = this.memberships.find(m => m.group_id === groupId && m.user_id === authUid && m.status === 'active');
    if (!mem) throw new Error('UNAUTHORIZED');

    const card = this.cards.find(c => c.id === cardId);
    if (!card) throw new Error('NOT_FOUND');
    if (card.group_id !== groupId) throw new Error('UNAUTHORIZED');
    if (card.member_id !== mem.id) throw new Error('UNAUTHORIZED');

    card.revoked = true;
  }
}

test('M14 Community Cards & Privacy Engine', async (t) => {
  const engine = new MockM14Engine();
  let validToken = '';
  let validCardId = '';

  await t.test('Test 1: Sanitization & Omission Invariant', () => {
    const res = engine.issueShareCard('group_A', 'uid_1', 'membership_card');
    assert.ok(res.token);
    assert.strictEqual(res.display_data.phone, undefined);
    assert.strictEqual(res.display_data.internal_id, undefined);
    assert.strictEqual(res.display_data.organization_name, 'Alpha Org');
    assert.strictEqual(res.display_data.member_display_name, 'Alice');
    
    validToken = res.token;
    validCardId = res.id;
  });

  await t.test('Test 2: Consent & Organization Setting Guard', () => {
    assert.throws(() => engine.issueShareCard('group_B', 'uid_2', 'membership_card'), /FORBIDDEN/);
  });

  await t.test('Test 3: Public Verification Token Defense', () => {
    const ver1 = engine.verifyPublicToken(validToken);
    assert.strictEqual(ver1.valid, true);
    assert.strictEqual(ver1.organization_name, 'Alpha Org');
    assert.strictEqual(ver1.phone, undefined);

    const ver2 = engine.verifyPublicToken('fake_token');
    assert.strictEqual(ver2.valid, false);
    assert.strictEqual(ver2.reason, 'not_found');
  });

  await t.test('Test 4: Cross-Tenant Revocation Protection', () => {
    assert.throws(() => engine.revokeShareCard('group_A', 'uid_2', validCardId), /UNAUTHORIZED/);
    
    engine.revokeShareCard('group_A', 'uid_1', validCardId);
    
    const ver = engine.verifyPublicToken(validToken);
    assert.strictEqual(ver.valid, false);
    assert.strictEqual(ver.reason, 'revoked');
  });
});
