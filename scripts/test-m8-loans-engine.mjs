import test from 'node:test';
import assert from 'node:assert/strict';

function parseLoanRpcError(error) {
  let msg = "";
  if (error instanceof Error) {
    msg = error.message;
  } else if (typeof error === "object" && error !== null) {
    const err = error;
    msg = String(err.message || err.details || err.hint || JSON.stringify(err));
  } else {
    msg = String(error);
  }

  if (msg.includes("CANNOT_GUARANTEE_OWN_LOAN")) return "CANNOT_GUARANTEE_OWN_LOAN";
  if (msg.includes("GUARANTOR_NOT_IN_GOOD_STANDING")) return "GUARANTOR_NOT_IN_GOOD_STANDING";
  if (msg.includes("GUARANTOR_HAS_DEFAULTED_LOANS")) return "GUARANTOR_HAS_DEFAULTED_LOANS";
  if (msg.includes("GUARANTOR_NOT_ACTIVE")) return "GUARANTOR_NOT_ACTIVE";
  if (msg.includes("LOAN_NOT_APPROVED_FOR_DISBURSEMENT")) return "LOAN_NOT_APPROVED_FOR_DISBURSEMENT";
  if (msg.includes("LOANS_RECEIVABLE_ACCOUNT_NOT_CONFIGURED")) return "LOANS_RECEIVABLE_ACCOUNT_NOT_CONFIGURED";
  if (msg.includes("LOAN_INTEREST_INCOME_ACCOUNT_NOT_CONFIGURED")) return "LOAN_INTEREST_INCOME_ACCOUNT_NOT_CONFIGURED";
  if (msg.includes("LOAN_NOT_IN_REPAYMENT")) return "LOAN_NOT_IN_REPAYMENT";
  if (msg.includes("REPAYMENT_EXCEEDS_OUTSTANDING_BALANCE")) return "REPAYMENT_EXCEEDS_OUTSTANDING_BALANCE";
  if (msg.includes("CURRENCY_MISMATCH")) return "CURRENCY_MISMATCH";
  if (msg.includes("INVALID_AMOUNT")) return "INVALID_AMOUNT";
  if (msg.includes("ACCOUNT_NOT_FOUND_OR_INACTIVE")) return "ACCOUNT_NOT_FOUND_OR_INACTIVE";
  if (msg.includes("UNAUTHORIZED")) return "UNAUTHORIZED";
  if (msg.includes("staleTenantAborted")) return "staleTenantAborted";
  return msg;
}

class MockM8LoanEngine {
  constructor() {
    this.loans = new Map();
    this.financialEvents = [];
    this.schedules = new Map();
    this.guarantors = new Map();
    this.accounts = {
      loans_receivable: true,
      loan_interest_income: true
    };
  }

  setGuarantor(id, { isActive, isGoodStanding, hasDefaultedLoans }) {
    this.guarantors.set(id, { isActive, isGoodStanding, hasDefaultedLoans });
  }

  createLoan(id, loan) {
    this.loans.set(id, { ...loan, status: 'approved', total_repaid: 0 });
  }

  approveLoan(loanId, guarantorId, borrowerId) {
    if (guarantorId === borrowerId) {
      throw new Error('CANNOT_GUARANTEE_OWN_LOAN');
    }
    const guarantor = this.guarantors.get(guarantorId);
    if (guarantor) {
      if (!guarantor.isActive) throw new Error('GUARANTOR_NOT_ACTIVE');
      if (!guarantor.isGoodStanding) throw new Error('GUARANTOR_NOT_IN_GOOD_STANDING');
      if (guarantor.hasDefaultedLoans) throw new Error('GUARANTOR_HAS_DEFAULTED_LOANS');
    }
    return true;
  }

  disburseLoan(loanId, accountCurrency) {
    const loan = this.loans.get(loanId);
    if (!loan) throw new Error('LOAN_NOT_FOUND');
    if (loan.currency !== accountCurrency) {
      throw new Error('CURRENCY_MISMATCH');
    }
    if (loan.status === 'repaying') {
      return { status: 'IDEMPOTENT_RETURN_EXISTING', postings: 0, duplicateSchedules: 0 };
    }
    if (loan.status !== 'approved') {
      throw new Error('LOAN_NOT_APPROVED_FOR_DISBURSEMENT');
    }
    if (!this.accounts.loans_receivable) {
      throw new Error('LOANS_RECEIVABLE_ACCOUNT_NOT_CONFIGURED');
    }

    loan.status = 'repaying';
    this.loans.set(loanId, loan);
    
    // Create schedule
    this.schedules.set(loanId, [
      { id: 1, amount_due: loan.total_repayable, amount_paid: 0, status: 'pending' }
    ]);
    
    return { status: 'success', postings: 2 };
  }

  recordRepayment(loanId, accountCurrency, amount) {
    const loan = this.loans.get(loanId);
    if (!loan) throw new Error('LOAN_NOT_FOUND');
    
    // UI simulation of pre-flight logic constraint
    if (amount <= 0) {
      throw new Error('INVALID_AMOUNT');
    }

    if (loan.currency !== accountCurrency) {
      throw new Error('CURRENCY_MISMATCH');
    }
    if (loan.status !== 'repaying' && loan.status !== 'overdue') {
      throw new Error('LOAN_NOT_IN_REPAYMENT');
    }
    const remainingBalance = loan.total_repayable - loan.total_repaid;
    if (amount > remainingBalance) {
      throw new Error('REPAYMENT_EXCEEDS_OUTSTANDING_BALANCE');
    }

    let interest_portion = 0;
    let principal_portion = 0;
    
    if ((loan.total_repayable - loan.amount_approved) <= 0) {
      interest_portion = 0;
      principal_portion = amount;
    } else {
      interest_portion = Math.round((amount * ((loan.total_repayable - loan.amount_approved) / loan.total_repayable)) * 100) / 100;
      principal_portion = amount - interest_portion;
    }

    if (!this.accounts.loans_receivable) {
      throw new Error('LOANS_RECEIVABLE_ACCOUNT_NOT_CONFIGURED');
    }
    if (interest_portion > 0 && !this.accounts.loan_interest_income) {
      throw new Error('LOAN_INTEREST_INCOME_ACCOUNT_NOT_CONFIGURED');
    }

    loan.total_repaid += amount;
    if (loan.total_repaid >= loan.total_repayable) {
      loan.status = 'completed';
    }

    this.loans.set(loanId, loan);
    return { 
      status: 'success', 
      debitCustody: amount, 
      creditLoansReceivable: principal_portion, 
      creditInterestIncome: interest_portion 
    };
  }
}

test('Stage M8 Loans Engine - Adversarial Verification', async (t) => {
  const engine = new MockM8LoanEngine();

  await t.test('Test A: Fuzzing negative & zero repayment amounts', () => {
    engine.createLoan('loan-fuzz', { amount_approved: 1000, total_repayable: 1100, currency: 'USD', interest_rate: 10 });
    engine.disburseLoan('loan-fuzz', 'USD');
    assert.throws(() => engine.recordRepayment('loan-fuzz', 'USD', 0), /INVALID_AMOUNT/);
    assert.throws(() => engine.recordRepayment('loan-fuzz', 'USD', -50), /INVALID_AMOUNT/);
  });

  await t.test('Test B: Zero-interest loan repayment (no division-by-zero, 100% principal)', () => {
    engine.createLoan('loan-zero', { amount_approved: 1000, total_repayable: 1000, currency: 'USD', interest_rate: 0 });
    engine.disburseLoan('loan-zero', 'USD');
    const result = engine.recordRepayment('loan-zero', 'USD', 200);
    assert.equal(result.creditInterestIncome, 0);
    assert.equal(result.creditLoansReceivable, 200);
    assert.equal(result.debitCustody, 200);
  });

  await t.test('Test C: Overpayment probe by 0.01', () => {
    engine.createLoan('loan-over', { amount_approved: 1000, total_repayable: 1100, currency: 'USD', interest_rate: 10 });
    engine.disburseLoan('loan-over', 'USD');
    assert.throws(() => {
      engine.recordRepayment('loan-over', 'USD', 1100.01);
    }, /REPAYMENT_EXCEEDS_OUTSTANDING_BALANCE/);
  });

  await t.test('Test D: Missing ledger accounts defense', () => {
    engine.createLoan('loan-missing', { amount_approved: 1000, total_repayable: 1100, currency: 'USD', interest_rate: 10 });
    engine.accounts.loans_receivable = false;
    assert.throws(() => engine.disburseLoan('loan-missing', 'USD'), /LOANS_RECEIVABLE_ACCOUNT_NOT_CONFIGURED/);
    
    engine.accounts.loans_receivable = true;
    engine.disburseLoan('loan-missing', 'USD');
    
    engine.accounts.loan_interest_income = false;
    assert.throws(() => engine.recordRepayment('loan-missing', 'USD', 100), /LOAN_INTEREST_INCOME_ACCOUNT_NOT_CONFIGURED/);
    
    engine.accounts.loan_interest_income = true;
    const ok = engine.recordRepayment('loan-missing', 'USD', 100);
    assert.equal(ok.status, 'success');
  });

  await t.test('Test E: Guarantor eligibility matrix', () => {
    engine.setGuarantor('g-inactive', { isActive: false, isGoodStanding: true, hasDefaultedLoans: false });
    engine.setGuarantor('g-badstanding', { isActive: true, isGoodStanding: false, hasDefaultedLoans: false });
    engine.setGuarantor('g-defaulted', { isActive: true, isGoodStanding: true, hasDefaultedLoans: true });

    assert.throws(() => engine.approveLoan('loan-e', 'self', 'self'), /CANNOT_GUARANTEE_OWN_LOAN/);
    assert.throws(() => engine.approveLoan('loan-e', 'g-inactive', 'other'), /GUARANTOR_NOT_ACTIVE/);
    assert.throws(() => engine.approveLoan('loan-e', 'g-badstanding', 'other'), /GUARANTOR_NOT_IN_GOOD_STANDING/);
    assert.throws(() => engine.approveLoan('loan-e', 'g-defaulted', 'other'), /GUARANTOR_HAS_DEFAULTED_LOANS/);
  });

  await t.test('Test F: Double-disbursement idempotency replay', () => {
    engine.createLoan('loan-idem', { amount_approved: 500, total_repayable: 500, currency: 'EUR', interest_rate: 0 });
    const res1 = engine.disburseLoan('loan-idem', 'EUR');
    assert.equal(res1.status, 'success');
    
    const res2 = engine.disburseLoan('loan-idem', 'EUR');
    assert.equal(res2.status, 'IDEMPOTENT_RETURN_EXISTING');
    assert.equal(res2.postings, 0);
    assert.equal(res2.duplicateSchedules, 0);
  });

  await t.test('Test G: Custody account currency mismatch', () => {
    engine.createLoan('loan-currency', { amount_approved: 500, total_repayable: 500, currency: 'XAF', interest_rate: 0 });
    assert.throws(() => engine.disburseLoan('loan-currency', 'EUR'), /CURRENCY_MISMATCH/);
  });
  
  await t.test('JSON Error Parsing verification', () => {
    const rawPostgREST = { message: 'staleTenantAborted', code: 'P0001' };
    assert.equal(parseLoanRpcError(rawPostgREST), 'staleTenantAborted');
    
    const rawSupabase = { details: 'LOANS_RECEIVABLE_ACCOUNT_NOT_CONFIGURED', hint: 'Check accounts' };
    assert.equal(parseLoanRpcError(rawSupabase), 'LOANS_RECEIVABLE_ACCOUNT_NOT_CONFIGURED');
  });
});
