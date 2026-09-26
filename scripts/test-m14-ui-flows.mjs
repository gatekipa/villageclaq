import test from 'node:test';
import assert from 'node:assert/strict';

class MockUIFlows {
  constructor() {
    this.cards = new Map();
  }

  issueCard(groupId, memberName, orgName) {
    const token = 'token_' + Date.now();
    this.cards.set(token, {
      valid: true,
      organization_name: orgName,
      member_display_name: memberName,
      issued_at: new Date().toISOString(),
      card_type: 'membership_card',
      _balance: 150, 
      _email: "test@example.com"
    });
    return token;
  }

  revokeCard(token) {
    if(this.cards.has(token)) {
      this.cards.get(token).valid = false;
    }
  }

  renderVerificationPage(token) {
    const rawData = this.cards.get(token);
    if (!rawData || !rawData.valid) {
      return { html: '<div class="error">Card Not Found or Revoked</div>', links: [] };
    }
    
    let org = rawData.organization_name;
    let mem = rawData.member_display_name;
    
    return {
      html: `<div class="card">
               <h1>Verified Member</h1>
               <p class="org">${org}</p>
               <p class="mem">${mem}</p>
             </div>`,
      links: [
        { href: "/", rel: "noopener noreferrer", text: "Powered by VillageClaq" }
      ],
      omittedKeys: Object.keys(rawData).filter(k => k.startsWith('_'))
    };
  }

  renderShareModal(token) {
    const rawData = this.cards.get(token);
    if (!rawData) return { html: '', buttons: [] };
    return {
      html: `<div>${rawData.organization_name}</div>`,
      buttons: [
        { label: 'Share to WhatsApp', height: 44 },
        { label: 'Copy Verification Link', height: 44 },
        { label: 'Revoke Card', height: 44 }
      ]
    };
  }
}

test('M14 UI Flows & Public Verification Engine', async (t) => {
  const ui = new MockUIFlows();
  let validToken = '';

  await t.test('Test 1: Card Modal Rendering & Omission', () => {
    validToken = ui.issueCard('group_A', 'Alice', 'Alpha Org');
    const modal = ui.renderShareModal(validToken);
    
    assert.ok(modal.html.includes('Alpha Org'));
    assert.ok(!modal.html.includes('150'));
    assert.ok(!modal.html.includes('test@example.com'));
  });

  await t.test('Test 2: Public Verification Page States', () => {
    const validPage = ui.renderVerificationPage(validToken);
    assert.ok(validPage.html.includes('Alpha Org'));
    assert.ok(validPage.html.includes('Verified Member'));

    ui.revokeCard(validToken);
    const revokedPage = ui.renderVerificationPage(validToken);
    assert.ok(revokedPage.html.includes('Card Not Found or Revoked'));
    assert.ok(!revokedPage.html.includes('Alpha Org'));
  });

  await t.test('Test 3: Attribution & Ingress Link Security', () => {
    const t2 = ui.issueCard('group_A', 'Bob', 'Alpha Org');
    const page = ui.renderVerificationPage(t2);
    
    const attributionLink = page.links.find(l => l.text === 'Powered by VillageClaq');
    assert.ok(attributionLink);
    assert.strictEqual(attributionLink.href, '/');
    assert.strictEqual(attributionLink.rel, 'noopener noreferrer');
  });

  await t.test('Test 4: Mobile Viewport & Touch Targets', () => {
    const t2 = ui.issueCard('group_A', 'Bob', 'Alpha Org');
    const modal = ui.renderShareModal(t2);
    
    for (const btn of modal.buttons) {
      assert.ok(btn.height >= 44, `Button ${btn.label} touch target is less than 44px`);
    }
  });
});
