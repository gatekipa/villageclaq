const fs = require('fs');

function updateJson(filePath, updater) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  updater(data);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

['messages/en.json', 'messages/fr.json'].forEach(file => {
  updateJson(file, (data) => {
    if (!data.reports) data.reports = {};
    if (!data.reports.statements) data.reports.statements = {};
    if (!data.reports.errors) data.reports.errors = {};

    const isFr = file.includes('fr.json');

    // Errors
    data.reports.errors.INVALID_CURRENCY = isFr ? "Devise spécifiée invalide ou non configurée." : "Invalid or unconfigured currency specified.";
    data.reports.errors.INVALID_STATEMENT_TYPE = isFr ? "Type de relevé financier demandé invalide." : "Invalid financial statement type requested.";
    data.reports.errors.UNAUTHORIZED = isFr ? "Vous n'avez pas l'autorisation de consulter les états financiers du groupe." : "You do not have permission to view group financial statements.";
    data.reports.errors.staleTenantAborted = isFr ? "Contexte d'organisation obsolète. Veuillez rafraîchir la page." : "Stale organization context. Please refresh the page.";

    // Statements UI
    data.reports.statements.tamperProofHash = isFr ? "Empreinte de vérification du document (SHA-256)" : "Document Verification Fingerprint (SHA-256)";
    data.reports.statements.generatedAt = isFr ? "Généré à (UTC)" : "Generated At (UTC)";
    data.reports.statements.balancedNotice = isFr ? "Équilibre de l'état : Vérifié mathématiquement" : "Statement Equilibrium: Mathematically Verified";
    data.reports.statements.unbalancedWarning = isFr ? "Équilibre de l'état : Écart non équilibré détecté" : "Statement Equilibrium: Unbalanced Discrepancy Detected";
  });
});
