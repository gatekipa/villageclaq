import test from 'node:test';
import assert from 'node:assert/strict';

class MockCardHooks {
  constructor(currentGroupId) {
    this.currentGroupId = currentGroupId;
    this.cache = new Map();
  }

  async issueCard(input) {
    if (input.groupId !== this.currentGroupId) {
      throw new Error("staleTenantAborted");
    }
    return { token: "token_123", display_data: { organization_name: 'Org A' } };
  }

  async revokeCard(input) {
    if (input.groupId !== this.currentGroupId) {
      throw new Error("staleTenantAborted");
    }
    this.cache.delete("public_card_verification_token_123");
    return true;
  }

  async verifyPublicToken(token) {
    if (token === "token_123") {
      const data = {
        valid: true,
        organization_name: "Org A",
        member_display_name: "Alice",
        issued_at: "2026-09-25T00:00:00Z",
        card_type: "membership_card",
        internal_uuid: "leaked_123", // Malicious payload test
        balance: 50
      };
      this.cache.set(`public_card_verification_${token}`, data);
      return data;
    }
    return { valid: false, reason: "not_found" };
  }
}

function sanitizePublicCardPayload(rawPayload, language = 'en') {
  if (!rawPayload || typeof rawPayload !== 'object') return null;
  if (rawPayload.valid === false) return null;

  const organizationName = typeof rawPayload.organization_name === 'string' 
    ? rawPayload.organization_name 
    : (language === 'fr' ? 'Organisation inconnue' : 'Unknown Organization');
    
  const memberDisplayName = typeof rawPayload.member_display_name === 'string' 
    ? rawPayload.member_display_name 
    : (language === 'fr' ? 'Membre' : 'Member');
  
  let issuedAt = new Date().toISOString();
  if (typeof rawPayload.issued_at === 'string' && !isNaN(Date.parse(rawPayload.issued_at))) {
    issuedAt = rawPayload.issued_at;
  }

  const allowedTypes = ['membership_card', 'election_success', 'milestone_achievement'];
  const cardType = allowedTypes.includes(rawPayload.card_type) ? rawPayload.card_type : 'membership_card';

  return {
    organizationName,
    memberDisplayName,
    issuedAt,
    cardType
  };
}

test('M14 Client Hooks & Card Hydration Bridge', async (t) => {
  const hooks = new MockCardHooks('group_A');

  await t.test('Test 1: Tenant Drift Guard', async () => {
    await assert.rejects(
      async () => await hooks.issueCard({ groupId: 'group_B', cardType: 'membership_card' }),
      /staleTenantAborted/
    );
  });

  await t.test('Test 2: Public Verification Query Lifecycle', async () => {
    const data = await hooks.verifyPublicToken('token_123');
    assert.strictEqual(data.valid, true);

    const badData = await hooks.verifyPublicToken('fake');
    assert.strictEqual(badData.valid, false);
  });

  await t.test('Test 3: Client-Side PII Leak Traps', async () => {
    const rawData = await hooks.verifyPublicToken('token_123');
    const sanitized = sanitizePublicCardPayload(rawData);
    
    assert.ok(sanitized);
    assert.strictEqual(sanitized.organizationName, 'Org A');
    
    // Ensure extraneous fields are completely stripped
    assert.strictEqual(sanitized.internal_uuid, undefined);
    assert.strictEqual(sanitized.balance, undefined);
  });

  await t.test('Test 4: Revocation Pipeline & Invalidation', async () => {
    await hooks.revokeCard({ groupId: 'group_A', cardId: 'card_789' });
    assert.strictEqual(hooks.cache.has('public_card_verification_token_123'), false);
  });
});
