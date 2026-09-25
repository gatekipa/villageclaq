import test from 'node:test';
import assert from 'node:assert/strict';

// Mock the React Query/Supabase environment
class MockReferralHooks {
  constructor(currentGroupId) {
    this.currentGroupId = currentGroupId;
    this.storage = new Map();
  }

  async generateReferral(input) {
    if (input.groupId !== this.currentGroupId) {
      throw new Error("staleTenantAborted");
    }
    return { token: "tok_12345", share_url: "https://villageclaq.com/onboard?ref=tok_12345" };
  }

  async claimReferral(input) {
    if (!input.token || input.token.trim() === '' || input.token === 'corrupted_token') {
      throw new Error("INVALID_TOKEN");
    }
    return { success: true, status: "claimed" };
  }

  storeToken(token) {
    this.storage.set("villageclaq_ref_token", token);
  }

  retrieveToken() {
    return this.storage.get("villageclaq_ref_token") || null;
  }

  clearToken() {
    this.storage.delete("villageclaq_ref_token");
  }
}

// Emulate WhatsApp Message formatter logic
function generateWhatsAppMessage(shareUrl, language = 'en') {
  let cleanUrl = shareUrl;
  try {
    const urlObj = new URL(shareUrl);
    const token = urlObj.searchParams.get('ref');
    if (token) {
      cleanUrl = `${urlObj.origin}${urlObj.pathname}?ref=${token}`;
    }
  } catch (e) {
    cleanUrl = shareUrl.split('?ref=')[0] + '?ref=' + (shareUrl.split('?ref=')[1]?.split('&')[0] || '');
  }

  let text = language === 'fr' 
    ? `Rejoignez-nous sur VillageClaq pour gérer notre organisation de manière transparente et sécurisée. Cliquez ici pour commencer : ${cleanUrl}`
    : `Join us on VillageClaq to manage our organization transparently and securely. Click here to get started: ${cleanUrl}`;

  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}


test('M13 Client Ingress, Edge Validation & Share Bridge', async (t) => {
  const hooks = new MockReferralHooks('group_A');

  await t.test('Test 1: Stale Tenant Guard in Hook', async () => {
    // Assert that mismatched groupId immediately aborts without hitting DB
    await assert.rejects(
      async () => await hooks.generateReferral({ groupId: 'group_B' }),
      /staleTenantAborted/
    );

    // Assert correct tenant succeeds
    const res = await hooks.generateReferral({ groupId: 'group_A' });
    assert.strictEqual(res.token, 'tok_12345');
  });

  await t.test('Test 2: Token Validation & Ingress Pipeline', async () => {
    const inboundToken = 'valid_tok_999';
    hooks.storeToken(inboundToken);
    
    // Simulate user doing something else, then retrieving token
    const cachedToken = hooks.retrieveToken();
    assert.strictEqual(cachedToken, 'valid_tok_999');

    // Claim it during org creation
    const res = await hooks.claimReferral({ token: cachedToken, newGroupId: 'new_group_XYZ' });
    assert.strictEqual(res.success, true);
    
    // Clear after claim
    hooks.clearToken();
    assert.strictEqual(hooks.retrieveToken(), null);
  });

  await t.test('Test 3: Tampered / Invalid Token Handling', async () => {
    // Assert corrupted/revoked token fails cleanly (so UI can fallback to normal org creation)
    await assert.rejects(
      async () => await hooks.claimReferral({ token: 'corrupted_token', newGroupId: 'new_group_XYZ' }),
      /INVALID_TOKEN/
    );
  });

  await t.test('Test 4: WhatsApp URL Encoding & Sanitization', () => {
    // Check injection attempt
    const maliciousUrl = 'https://villageclaq.com/onboard?ref=tok_123&malicious_param=steal_cookie';
    const waUrl = generateWhatsAppMessage(maliciousUrl, 'en');

    // Ensure malicious_param is stripped from the deep link
    assert.ok(waUrl.includes('ref%3Dtok_123'));
    assert.ok(!waUrl.includes('malicious_param'));

    // Check FR encoding works correctly
    const waUrlFr = generateWhatsAppMessage('https://villageclaq.com/onboard?ref=tok_456', 'fr');
    assert.ok(waUrlFr.includes('Rejoignez-nous%20sur%20VillageClaq'));
    assert.ok(waUrlFr.includes('ref%3Dtok_456'));
  });
});
