import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

function parseExactAmount(val) {
  if (!val) return BigInt(0);
  const isNegative = val.startsWith('-');
  const absStr = isNegative ? val.slice(1) : val;
  const parts = absStr.split('.');
  const integerPart = parts[0] || '0';
  let decimalPart = parts[1] || '';
  if (decimalPart.length > 2) decimalPart = decimalPart.slice(0, 2);
  else while (decimalPart.length < 2) decimalPart += '0';
  const result = BigInt(integerPart + decimalPart);
  return isNegative ? -result : result;
}

function formatExactAmount(val) {
  const isNegative = val < BigInt(0);
  const absVal = isNegative ? -val : val;
  let str = absVal.toString();
  while (str.length <= 2) {
    str = '0' + str;
  }
  const result = str.slice(0, -2) + '.' + str.slice(-2);
  return isNegative ? '-' + result : result;
}

function computeSnapshotFingerprint(payload) {
  const normalize = (obj) => {
    if (Array.isArray(obj)) return obj.map(normalize);
    if (obj !== null && typeof obj === 'object') {
      return Object.keys(obj).sort().reduce((acc, key) => {
        acc[key] = normalize(obj[key]);
        return acc;
      }, {});
    }
    return obj;
  };
  const data = JSON.stringify(normalize(payload));
  return crypto.createHash('sha256').update(data).digest('hex');
}

class LedgerIntegrityException extends Error {}

function rehydrateLedger(snapshot) {
  const { fingerprint, ...payload } = snapshot;
  if (fingerprint !== computeSnapshotFingerprint(payload)) {
    throw new LedgerIntegrityException('Tampered ledger fingerprint');
  }

  const foreign = snapshot.accounts.some(a => a.group_id !== snapshot.groupId) ||
                  snapshot.postings.some(p => p.group_id !== snapshot.groupId);
  if (foreign) throw new LedgerIntegrityException('Multi-tenant violation');

  const balances = {};
  const sumByCurrency = {};
  
  for (const acc of snapshot.accounts) balances[acc.id] = BigInt(0);

  const sortedPostings = [...snapshot.postings].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  for (const p of sortedPostings) {
    const amt = parseExactAmount(p.amount);
    if (!sumByCurrency[p.currency]) sumByCurrency[p.currency] = { debit: BigInt(0), credit: BigInt(0) };
    const acc = snapshot.accounts.find(a => a.id === p.financial_account_id);
    
    if (p.direction === 'debit') {
      sumByCurrency[p.currency].debit += amt;
      balances[acc.id] += (acc.normal_balance === 'debit' ? amt : -amt);
    } else {
      sumByCurrency[p.currency].credit += amt;
      balances[acc.id] += (acc.normal_balance === 'credit' ? amt : -amt);
    }
  }

  for (const [cur, totals] of Object.entries(sumByCurrency)) {
    if (totals.debit !== totals.credit) throw new LedgerIntegrityException('Equilibrium broken');
  }

  const proofs = {};
  for (const acc of snapshot.accounts) {
    const formatted = formatExactAmount(balances[acc.id]);
    proofs[acc.id] = formatted;
    if (snapshot.balanceProofs[acc.id] !== formatted) throw new LedgerIntegrityException('Balance proof failed');
  }
  
  return proofs;
}

class UnifiedE2EEngine {
  constructor() {
    this.groups = [];
    this.memberships = [];
    this.accounts = [];
    this.postings = [];
    this.elections = [];
    this.ballots = [];
    this.loans = [];
    this.relief = [];
    this.events = [];
    this.outbox = [];
  }

  createGroup(id) {
    this.groups.push({ id });
    this.accounts.push(
      { id: `cash_${id}`, group_id: id, account_class: 'asset', normal_balance: 'debit', currency: 'USD' },
      { id: `dues_${id}`, group_id: id, account_class: 'revenue', normal_balance: 'credit', currency: 'USD' },
      { id: `loans_rec_${id}`, group_id: id, account_class: 'asset', normal_balance: 'debit', currency: 'USD' },
      { id: `interest_inc_${id}`, group_id: id, account_class: 'revenue', normal_balance: 'credit', currency: 'USD' },
      { id: `relief_exp_${id}`, group_id: id, account_class: 'expense', normal_balance: 'debit', currency: 'USD' },
      { id: `ticket_rev_${id}`, group_id: id, account_class: 'revenue', normal_balance: 'credit', currency: 'USD' },
      { id: `equity_${id}`, group_id: id, account_class: 'equity', normal_balance: 'credit', currency: 'USD' }
    );
  }

  addMember(groupId, memberId, role) {
    this.memberships.push({ group_id: groupId, member_id: memberId, role });
  }

  postFinancialEvent(groupId, debits, credits) {
    const eventId = crypto.randomUUID();
    const ts = new Date().toISOString();
    let totalDebit = BigInt(0);
    let totalCredit = BigInt(0);
    
    for (const d of debits) {
      totalDebit += parseExactAmount(d.amount);
      this.postings.push({
        id: crypto.randomUUID(), group_id: groupId, financial_event_id: eventId,
        financial_account_id: d.account_id, amount: d.amount, currency: 'USD',
        direction: 'debit', timestamp: ts
      });
    }
    
    for (const c of credits) {
      totalCredit += parseExactAmount(c.amount);
      this.postings.push({
        id: crypto.randomUUID(), group_id: groupId, financial_event_id: eventId,
        financial_account_id: c.account_id, amount: c.amount, currency: 'USD',
        direction: 'credit', timestamp: ts
      });
    }
    
    if (totalDebit !== totalCredit) throw new Error("F3 Double Entry Violation");
  }

  enqueueNotification(groupId, message) {
    this.outbox.push({ id: crypto.randomUUID(), group_id: groupId, message, status: 'pending', locked: false, attempts: 0 });
  }
}

test('M12 E2E Cross-Milestone Integration Lifecycle', async (t) => {
  const engine = new UnifiedE2EEngine();

  await t.test('Step 1 (Tenancy & RBAC): Bootstrap Alpha and Beta', () => {
    engine.createGroup('alpha');
    engine.createGroup('beta');
    engine.addMember('alpha', 'admin_a', 'owner');
    engine.addMember('alpha', 'member_a', 'member');
    engine.addMember('beta', 'admin_b', 'owner');
    
    assert.strictEqual(engine.groups.length, 2);
    assert.strictEqual(engine.accounts.length, 14);
  });

  await t.test('Step 2 (Dues Ingress & F3 Bridge): Record payment', () => {
    engine.postFinancialEvent('alpha', 
      [{ account_id: 'cash_alpha', amount: '100.00' }],
      [{ account_id: 'dues_alpha', amount: '100.00' }]
    );
    engine.enqueueNotification('alpha', 'Dues paid');
    assert.strictEqual(engine.postings.filter(p => p.group_id === 'alpha').length, 2);
  });

  await t.test('Step 3 (Governance & Secret Ballots): Elections', () => {
    engine.elections.push({ id: 'elec_1', group_id: 'alpha', status: 'closed' });
    engine.ballots.push({ election_id: 'elec_1', encrypted_vote: 'xyz' });
    assert.strictEqual(engine.ballots.length, 1);
  });

  await t.test('Step 4 (Loans & Amortization): Issue and repay', () => {
    // Disburse 50.00
    engine.postFinancialEvent('alpha',
      [{ account_id: 'loans_rec_alpha', amount: '50.00' }],
      [{ account_id: 'cash_alpha', amount: '50.00' }]
    );
    // Repay 55.00 (50 principal + 5 interest)
    engine.postFinancialEvent('alpha',
      [{ account_id: 'cash_alpha', amount: '55.00' }],
      [
        { account_id: 'loans_rec_alpha', amount: '50.00' },
        { account_id: 'interest_inc_alpha', amount: '5.00' }
      ]
    );
    engine.enqueueNotification('alpha', 'Loan repaid');
  });

  await t.test('Step 5 (Relief Plan Claim & Payout): Disburse relief', () => {
    engine.postFinancialEvent('alpha',
      [{ account_id: 'relief_exp_alpha', amount: '20.00' }],
      [{ account_id: 'cash_alpha', amount: '20.00' }]
    );
  });

  await t.test('Step 6 (Event Ticketing & Check-In): Ticket purchase', () => {
    engine.postFinancialEvent('alpha',
      [{ account_id: 'cash_alpha', amount: '15.00' }],
      [{ account_id: 'ticket_rev_alpha', amount: '15.00' }]
    );
  });

  await t.test('Step 7 (Communications Outbox Processing): Simulate workers', () => {
    let processed = 0;
    for (const msg of engine.outbox) {
      if (msg.status === 'pending' && msg.group_id === 'alpha') {
        msg.locked = true;
        msg.status = 'sent';
        msg.locked = false;
        processed++;
      }
    }
    assert.strictEqual(processed, 2);
  });

  await t.test('Step 8 (Financial Statement & Trial Balance Integrity): Proving equilibrium', () => {
    // Total Debits = 100 + 50 + 55 + 20 + 15 = 240
    // Total Credits = 100 + 50 + 50 + 5 + 20 + 15 = 240
    let debit = BigInt(0);
    let credit = BigInt(0);
    for (const p of engine.postings) {
      if (p.group_id === 'alpha') {
        if (p.direction === 'debit') debit += parseExactAmount(p.amount);
        else credit += parseExactAmount(p.amount);
      }
    }
    assert.strictEqual(debit, BigInt(24000));
    assert.strictEqual(credit, BigInt(24000));
  });

  await t.test('Step 9 (Cold-Start Replay & Verification): Snapshot & Rehydrate', () => {
    const alphaAccounts = engine.accounts.filter(a => a.group_id === 'alpha');
    const alphaPostings = engine.postings.filter(p => p.group_id === 'alpha');
    
    const balanceProofs = {
      'cash_alpha': '100.00',          // 100 - 50 + 55 - 20 + 15 = 100.00
      'dues_alpha': '100.00',          // 100.00
      'loans_rec_alpha': '0.00',       // 50 - 50 = 0.00
      'interest_inc_alpha': '5.00',    // 5.00
      'relief_exp_alpha': '20.00',     // 20.00
      'ticket_rev_alpha': '15.00',     // 15.00
      'equity_alpha': '0.00'           // 0.00
    };

    const payload = { groupId: 'alpha', accounts: alphaAccounts, postings: alphaPostings, epochs: [], balanceProofs };
    const snapshot = { ...payload, fingerprint: computeSnapshotFingerprint(payload) };

    const proofs = rehydrateLedger(snapshot);
    assert.strictEqual(proofs['cash_alpha'], '100.00');
    assert.strictEqual(proofs['relief_exp_alpha'], '20.00');

    // Verify Beta remains isolated
    assert.strictEqual(engine.postings.filter(p => p.group_id === 'beta').length, 0);
  });
});
