const fs = require('fs');
const path = require('path');

const enPath = path.join(__dirname, '../messages/en.json');
const frPath = path.join(__dirname, '../messages/fr.json');

const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const fr = JSON.parse(fs.readFileSync(frPath, 'utf8'));

const reliefEn = {
  statuses: {
    active: "Active",
    paused: "Paused",
    retired: "Retired"
  },
  claimStatuses: {
    submitted: "Submitted",
    underReview: "Under Review",
    approved: "Approved",
    rejected: "Rejected",
    paid: "Paid"
  },
  fields: {
    planName: "Plan Name",
    coverageAmount: "Coverage Amount",
    waitingPeriod: "Waiting Period (Days)",
    incidentDate: "Incident Date",
    amountRequested: "Amount Requested",
    amountApproved: "Amount Approved",
    reviewNotes: "Review Notes",
    custodyAccount: "Custody Account"
  },
  actions: {
    createPlan: "Create Plan",
    enrollMember: "Enroll Member",
    submitClaim: "Submit Claim",
    reviewClaim: "Review Claim",
    disbursePayout: "Disburse Payout"
  },
  errors: {
    CLAIM_NOT_APPROVED_FOR_PAYOUT: "Claim is not approved for payout.",
    CURRENCY_MISMATCH: "Currency mismatch between claim and account.",
    NO_ACTIVE_EPOCH: "No active financial epoch exists for this group.",
    ACCOUNT_NOT_FOUND_OR_INACTIVE: "Custody account not found or inactive.",
    WAITING_PERIOD_NOT_MET: "Waiting period has not been met for this enrollment.",
    MEMBER_NOT_GOOD_STANDING: "Member is not in good standing.",
    staleTenantAborted: "Stale tenant context detected. Action aborted."
  }
};

const reliefFr = {
  statuses: {
    active: "Actif",
    paused: "En pause",
    retired: "Retiré"
  },
  claimStatuses: {
    submitted: "Soumis",
    underReview: "En cours d'examen",
    approved: "Approuvé",
    rejected: "Rejeté",
    paid: "Payé"
  },
  fields: {
    planName: "Nom du plan",
    coverageAmount: "Montant de couverture",
    waitingPeriod: "Période de carence (Jours)",
    incidentDate: "Date de l'incident",
    amountRequested: "Montant demandé",
    amountApproved: "Montant approuvé",
    reviewNotes: "Notes d'examen",
    custodyAccount: "Compte de garde"
  },
  actions: {
    createPlan: "Créer un plan",
    enrollMember: "Inscrire un membre",
    submitClaim: "Soumettre une réclamation",
    reviewClaim: "Examiner la réclamation",
    disbursePayout: "Décaisser le paiement"
  },
  errors: {
    CLAIM_NOT_APPROVED_FOR_PAYOUT: "La réclamation n'est pas approuvée pour le paiement.",
    CURRENCY_MISMATCH: "Incompatibilité de devise entre la réclamation et le compte.",
    NO_ACTIVE_EPOCH: "Aucun cycle financier actif n'existe pour ce groupe.",
    ACCOUNT_NOT_FOUND_OR_INACTIVE: "Compte de garde introuvable ou inactif.",
    WAITING_PERIOD_NOT_MET: "La période de carence n'a pas été atteinte pour cette inscription.",
    MEMBER_NOT_GOOD_STANDING: "Le membre n'est pas en règle.",
    staleTenantAborted: "Contexte de groupe obsolète détecté. Action annulée."
  }
};

en.relief = reliefEn;
fr.relief = reliefFr;

// simple check parity
const checkParity = (obj1, obj2, path = '') => {
  for (const key in obj1) {
    if (!(key in obj2)) throw new Error(`Missing key ${path}.${key} in second obj`);
    if (typeof obj1[key] === 'object') checkParity(obj1[key], obj2[key], `${path}.${key}`);
  }
  for (const key in obj2) {
    if (!(key in obj1)) throw new Error(`Missing key ${path}.${key} in first obj`);
  }
};
checkParity(en, fr);

fs.writeFileSync(enPath, JSON.stringify(en, null, 2) + '\n');
fs.writeFileSync(frPath, JSON.stringify(fr, null, 2) + '\n');

console.log("JSON dictionaries updated and AST parity verified.");
