const fs = require('fs');

function updateJson(filePath, updater) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  updater(data);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

['messages/en.json', 'messages/fr.json'].forEach(file => {
  updateJson(file, (data) => {
    const isFr = file.includes('fr.json');

    // Report 1: Balance Sheet
    data.reports.report1.name = isFr ? "Bilan (État de la situation financière)" : "Balance Sheet (Statement of Financial Position)";
    data.reports.report1.desc = isFr ? "Position des actifs, passifs et capitaux propres (F3 Canonique)." : "Canonical F3 asset, liability, and equity position.";

    // Report 2: Income Statement
    data.reports.report2.name = isFr ? "Compte de Résultat (Pertes & Profits)" : "Income Statement (Profit & Loss)";
    data.reports.report2.desc = isFr ? "État des revenus et des dépenses (F3 Canonique)." : "Canonical F3 revenue and expense statement.";

    // Report 3: Trial Balance
    data.reports.report3.name = isFr ? "Balance Générale" : "Trial Balance";
    data.reports.report3.desc = isFr ? "Balance générale à double entrée mathématiquement vérifiée." : "Mathematically verified double-entry trial balance.";

    // Report 4: Member Contribution Statement
    data.reports.report4.name = isFr ? "Relevé Financier du Membre" : "Member Contribution Statement";
    data.reports.report4.desc = isFr ? "Grand livre personnel des paiements des membres." : "Personal ledger of member payments.";
  });
});
