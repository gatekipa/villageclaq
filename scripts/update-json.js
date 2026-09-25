const fs = require('fs');
const path = require('path');

const enPath = path.join(__dirname, '../messages/en.json');
const frPath = path.join(__dirname, '../messages/fr.json');

const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const fr = JSON.parse(fs.readFileSync(frPath, 'utf8'));

const govEn = {
  title: "Assemblies",
  subtitle: "Manage constitutional meetings and voting quorum",
  resolutionsTitle: "Resolutions",
  resolutionsSubtitle: "Immutable ledger of adopted motions and records",
  newAssembly: "New Assembly",
  callToOrder: "Call to Order",
  recordRollCall: "Record Roll Call",
  adjournAssembly: "Adjourn Assembly",
  tallyVotes: "Tally Votes",
  statusDraft: "Draft",
  statusCalledToOrder: "Called to Order",
  statusInSession: "In Session",
  statusAdjourned: "Adjourned",
  statusArchived: "Archived",
  typeAgm: "AGM",
  typeGeneralAssembly: "General Assembly",
  typeExtraordinaryAssembly: "Extraordinary Assembly",
  typeCommittee: "Committee",
  eligibleMembers: "Eligible Members",
  requiredQuorum: "Required Quorum",
  presentMembers: "Present Members",
  quorumAchieved: "Quorum Achieved",
  quorumPending: "Quorum Pending",
  statusTabled: "Tabled",
  statusAdopted: "Adopted",
  statusRejected: "Rejected",
  statusWithdrawn: "Withdrawn",
  ruleSimpleMajority: "Simple Majority",
  ruleTwoThirds: "2/3 Supermajority",
  ruleThreeFourths: "3/4 Supermajority",
  ruleUnanimous: "Unanimous",
  immutabilityNotice: "This assembly has been adjourned; resolutions and attendance records are permanently sealed.",
  newResolution: "New Resolution"
};

const govFr = {
  title: "Assemblées",
  subtitle: "Gérez les réunions statutaires et le quorum de vote",
  resolutionsTitle: "Résolutions",
  resolutionsSubtitle: "Registre immuable des motions et procès-verbaux",
  newAssembly: "Nouvelle Assemblée",
  callToOrder: "Déclarer l'ouverture",
  recordRollCall: "Faire l'appel",
  adjournAssembly: "Clore l'assemblée",
  tallyVotes: "Dépouillement",
  statusDraft: "Brouillon",
  statusCalledToOrder: "Ouverte",
  statusInSession: "En Session",
  statusAdjourned: "Close",
  statusArchived: "Archivée",
  typeAgm: "AGO",
  typeGeneralAssembly: "Assemblée Générale",
  typeExtraordinaryAssembly: "Assemblée Extraordinaire",
  typeCommittee: "Comité",
  eligibleMembers: "Membres Éligibles",
  requiredQuorum: "Quorum Requis",
  presentMembers: "Membres Présents",
  quorumAchieved: "Quorum Atteint",
  quorumPending: "En attente du quorum",
  statusTabled: "Ajournée",
  statusAdopted: "Adoptée",
  statusRejected: "Rejetée",
  statusWithdrawn: "Retirée",
  ruleSimpleMajority: "Majorité Simple",
  ruleTwoThirds: "Majorité 2/3",
  ruleThreeFourths: "Majorité 3/4",
  ruleUnanimous: "Unanimité",
  immutabilityNotice: "Cette assemblée est close; les résolutions et les présences sont définitivement scellées.",
  newResolution: "Nouvelle Résolution"
};

en.governance = govEn;
fr.governance = govFr;

fs.writeFileSync(enPath, JSON.stringify(en, null, 2) + "\n");
fs.writeFileSync(frPath, JSON.stringify(fr, null, 2) + "\n");
