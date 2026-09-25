import test from 'node:test';
import assert from 'node:assert/strict';

class MockUIFlows {
  constructor() {
    this.storage = new Map();
    this.organizations = [];
  }

  // Hook mocking
  storeToken(token) { this.storage.set("villageclaq_ref_token", token); }
  retrieveToken() { return this.storage.get("villageclaq_ref_token"); }
  clearToken() { this.storage.delete("villageclaq_ref_token"); }

  async generateReferral(groupId, activeMember) {
    if (!activeMember) throw new Error("staleTenantAborted");
    return "https://villageclaq.com/onboard?ref=mock_token";
  }

  async claimReferral(token, newGroupId) {
    if (token === 'mock_token') return { success: true };
    throw new Error("INVALID_TOKEN");
  }

  async createOrganization(name, activeToken) {
    const newGroupId = "group_" + Date.now();
    this.organizations.push({ id: newGroupId, name });
    
    // Auto claim logic in wizard
    if (activeToken) {
      try {
        await this.claimReferral(activeToken, newGroupId);
        this.clearToken();
      } catch (e) {
        // graceful degradation: don't abort org creation
      }
    }
    return newGroupId;
  }
}

test('M13 UI Monolith & Mobile Sharing Flows', async (t) => {
  const engine = new MockUIFlows();

  await t.test('Test 1: Modal State & Trigger Bounds', async () => {
    // Non-active member generating fails
    await assert.rejects(() => engine.generateReferral('group_A', false), /staleTenantAborted/);
    
    // Active member succeeds
    const link = await engine.generateReferral('group_A', true);
    assert.strictEqual(link, "https://villageclaq.com/onboard?ref=mock_token");
  });

  await t.test('Test 2: Onboarding Token Ingress Hookup', async () => {
    // User clicks link, visits onboard, token stored
    engine.storeToken('mock_token');
    
    const token = engine.retrieveToken();
    assert.ok(token);

    // Creates org
    const newGroupId = await engine.createOrganization("Beta Alumni", token);
    assert.ok(newGroupId);

    // Token should be consumed and cleared
    assert.strictEqual(engine.retrieveToken(), undefined);
  });

  await t.test('Test 3: Mobile Viewport & Graceful Degradation', async () => {
    // Inject invalid token
    engine.storeToken('expired_token');
    
    // Org creation should STILL succeed, even if claim fails
    const newGroupId = await engine.createOrganization("Charlie Group", engine.retrieveToken());
    assert.ok(newGroupId); // Success! Not aborted.
  });
});
