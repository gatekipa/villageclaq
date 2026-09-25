import { createHash } from 'crypto';

export interface FinancialAccount {
  id: string;
  group_id: string;
  name: string;
  account_class: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  normal_balance: 'debit' | 'credit';
  currency: string;
}

export interface Posting {
  id: string;
  group_id: string;
  financial_event_id: string;
  financial_account_id: string;
  amount: string; 
  currency: string;
  direction: 'debit' | 'credit';
  timestamp: string;
}

export interface Epoch {
  id: string;
  group_id: string;
  closed_at: string;
  status: 'open' | 'closed';
}

export interface LedgerSnapshot {
  groupId: string;
  accounts: FinancialAccount[];
  postings: Posting[];
  epochs: Epoch[];
  balanceProofs: Record<string, string>; 
  fingerprint: string;
}

export class LedgerIntegrityException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerIntegrityException';
  }
}

export function parseExactAmount(val: string): bigint {
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

export function formatExactAmount(val: bigint): string {
  const isNegative = val < BigInt(0);
  const absVal = isNegative ? -val : val;
  let str = absVal.toString();
  while (str.length <= 2) {
    str = '0' + str;
  }
  const result = str.slice(0, -2) + '.' + str.slice(-2);
  return isNegative ? '-' + result : result;
}

export function computeSnapshotFingerprint(payload: Omit<LedgerSnapshot, 'fingerprint'>): string {
  const normalize = (obj: any): any => {
    if (Array.isArray(obj)) return obj.map(normalize);
    if (obj !== null && typeof obj === 'object') {
      return Object.keys(obj).sort().reduce((acc, key) => {
        acc[key] = normalize(obj[key]);
        return acc;
      }, {} as any);
    }
    return obj;
  };
  
  const data = JSON.stringify(normalize(payload));
  return createHash('sha256').update(data).digest('hex');
}

export function snapshotLedger(
  groupId: string,
  accounts: FinancialAccount[],
  postings: Posting[],
  epochs: Epoch[],
  balanceProofs: Record<string, string>
): LedgerSnapshot {
  const payload = { groupId, accounts, postings, epochs, balanceProofs };
  const fingerprint = computeSnapshotFingerprint(payload);
  return { ...payload, fingerprint };
}

export function rehydrateLedger(snapshot: LedgerSnapshot): Record<string, string> {
  const { fingerprint, ...payload } = snapshot;
  const expectedFingerprint = computeSnapshotFingerprint(payload);
  if (fingerprint !== expectedFingerprint) {
    throw new LedgerIntegrityException('Cryptographic fingerprint mismatch: Ledger has been tampered with.');
  }

  const foreignData = snapshot.accounts.some(a => a.group_id !== snapshot.groupId) ||
                      snapshot.postings.some(p => p.group_id !== snapshot.groupId) ||
                      snapshot.epochs.some(e => e.group_id !== snapshot.groupId);
  if (foreignData) {
    throw new LedgerIntegrityException('Multi-tenant violation: Foreign tenant data detected in snapshot.');
  }

  const balances: Record<string, bigint> = {};
  const sumByCurrency: Record<string, { debit: bigint, credit: bigint }> = {};

  const sortedPostings = [...snapshot.postings].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  for (const acc of snapshot.accounts) {
    balances[acc.id] = BigInt(0);
  }

  for (const posting of sortedPostings) {
    const closedEpochs = snapshot.epochs.filter(e => e.status === 'closed' && new Date(posting.timestamp) <= new Date(e.closed_at));
    if (closedEpochs.length > 0) {
      throw new LedgerIntegrityException(`Epoch invariance violation: Posting ${posting.id} falls within a closed epoch.`);
    }

    const amountBigInt = parseExactAmount(posting.amount);
    
    if (!sumByCurrency[posting.currency]) {
      sumByCurrency[posting.currency] = { debit: BigInt(0), credit: BigInt(0) };
    }

    const account = snapshot.accounts.find(a => a.id === posting.financial_account_id);
    if (!account) {
       throw new LedgerIntegrityException(`Account ${posting.financial_account_id} not found for posting ${posting.id}.`);
    }

    if (posting.direction === 'debit') {
      sumByCurrency[posting.currency].debit += amountBigInt;
      if (account.normal_balance === 'debit') balances[account.id] += amountBigInt;
      else balances[account.id] -= amountBigInt;
    } else {
      sumByCurrency[posting.currency].credit += amountBigInt;
      if (account.normal_balance === 'credit') balances[account.id] += amountBigInt;
      else balances[account.id] -= amountBigInt;
    }
  }

  for (const [currency, totals] of Object.entries(sumByCurrency)) {
    if (totals.debit !== totals.credit) {
      throw new LedgerIntegrityException(`Equilibrium violation in currency ${currency}: Debits (${formatExactAmount(totals.debit)}) != Credits (${formatExactAmount(totals.credit)}).`);
    }
  }

  const rehydratedProofs: Record<string, string> = {};
  for (const acc of snapshot.accounts) {
    const formatted = formatExactAmount(balances[acc.id]);
    rehydratedProofs[acc.id] = formatted;
    
    if (snapshot.balanceProofs[acc.id] !== formatted) {
      throw new LedgerIntegrityException(`Balance proof mismatch for account ${acc.id}. Expected ${snapshot.balanceProofs[acc.id]}, got ${formatted}.`);
    }
  }

  return rehydratedProofs;
}
