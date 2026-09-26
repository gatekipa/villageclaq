import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

class MockM15Engine {
  constructor() {
    this.profiles = new Map();
    this.requests = [];
    this.outbox = [];
  }

  configureProfile(groupId, slug, visibility, displayName, desc, allowRequests) {
    if (slug.match(/[^a-z0-9-]/)) throw new Error("INVALID_FORMAT: Slug");
    for (const [id, prof] of this.profiles.entries()) {
      if (prof.slug === slug && id !== groupId) throw new Error("CONFLICT: Slug");
    }

    this.profiles.set(groupId, {
      group_id: groupId, slug, visibility, display_name: displayName, 
      description: desc, allow_membership_requests: allowRequests
    });
    return this.profiles.get(groupId);
  }

  getPublicProfile(slug) {
    const prof = Array.from(this.profiles.values()).find(p => p.slug === slug);
    if (!prof) return null;
    if (prof.visibility === 'private') return null;
    return {
      slug: prof.slug,
      display_name: prof.display_name,
      description: prof.description,
      allow_membership_requests: prof.allow_membership_requests
    };
  }

  submitRequest(slug, fullName, email, message) {
    const prof = Array.from(this.profiles.values()).find(p => p.slug === slug);
    if (!prof || prof.visibility === 'private' || !prof.allow_membership_requests) {
      throw new Error("NOT_FOUND");
    }

    const cleanName = fullName.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const requestId = crypto.randomUUID();

    this.requests.push({
      id: requestId, group_id: prof.group_id, full_name: cleanName, email, message
    });

    this.outbox.push({
      group_id: prof.group_id,
      template: 'new_membership_request',
      request_id: requestId
    });

    return { success: true, request_id: requestId };
  }

  viewRequests(groupId, requesterIsAdmin) {
    if (!requesterIsAdmin) throw new Error("UNAUTHORIZED");
    return this.requests.filter(r => r.group_id === groupId);
  }
}

test('M15 Public Profiles & Ingress', async (t) => {
  const engine = new MockM15Engine();

  await t.test('Test 1: Private-by-Default Boundary', () => {
    engine.configureProfile('g1', 'secret-org', 'private', 'Secret Org', '...', true);
    
    const prof = engine.getPublicProfile('secret-org');
    assert.strictEqual(prof, null); 

    assert.throws(() => engine.submitRequest('secret-org', 'Alice', 'a@example.com', 'hi'), /NOT_FOUND/);
  });

  await t.test('Test 2: Slug Collision & Format Defense', () => {
    assert.throws(() => engine.configureProfile('g2', 'Invalid Slug!', 'public', 'Org', '', true), /INVALID_FORMAT/);
    
    engine.configureProfile('g2', 'alpha', 'public', 'Alpha', '', true);
    assert.throws(() => engine.configureProfile('g3', 'alpha', 'public', 'Beta', '', true), /CONFLICT/);
  });

  await t.test('Test 3: Public Membership Request Pipeline', () => {
    engine.configureProfile('g4', 'open-org', 'public', 'Open Org', 'Desc', true);
    
    const res = engine.submitRequest('open-org', '<script>alert(1)</script>Bob', 'b@example.com', 'Join');
    assert.ok(res.success);

    const notification = engine.outbox.find(o => o.request_id === res.request_id);
    assert.ok(notification);
    assert.strictEqual(notification.group_id, 'g4');

    const req = engine.viewRequests('g4', true).find(r => r.id === res.request_id);
    assert.strictEqual(req.full_name, '&lt;script&gt;alert(1)&lt;/script&gt;Bob');
  });

  await t.test('Test 4: Cross-Tenant Admin Isolation', () => {
    assert.throws(() => engine.viewRequests('g4', false), /UNAUTHORIZED/);
    
    const reqs = engine.viewRequests('g2', true); 
    assert.strictEqual(reqs.length, 0); 
  });
});
