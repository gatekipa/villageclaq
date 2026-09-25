const fs = require('fs');
const path = 'docs/BUILD_STATUS.md';
let content = fs.readFileSync(path, 'utf8');

// Update Next Master Milestone in the table (line ~29)
content = content.replace(
  /\| \*\*Next Master Milestone\*\* \| \*\*M10 .*? \|/,
  `| **Next Master Milestone** | **M11 (Transactional Communications & Notification Delivery Engine Rebuild)** designated per PRD Section 10 and Section 26 sequence. Followed by M12, M13 (§31 Planned), M14 (§31 Planned), M15 (§31 Planned). Merge/deploy to \`origin/main\` remains separately founder-controlled. |`
);

// Add M10 Completion to the list
const m10Section = `13. **Milestone M10 Completion: Financial Reporting, Auditing & Export Engine Rebuild** — **COMPLETE / VERIFIED.**
    - Schema & Canonical Views: Migrations \`00131_m10_01_financial_statements.sql\` establishes canonical reporting views \`v_f3_trial_balance\` and \`v_f3_account_ledger\`, integrating strict epoch offsets and double-entry invariants.
    - Client Hooks & UI Refactor: \`src/lib/hooks/use-reports-queries.ts\` safely handles currency partitioning. \`<CanonicalReportRenderer />\` excises legacy \`.reduce()\` logic.
    - Auditing & Exports: Tamper-evident cryptographic fingerprint (SHA-256) pipeline is built into \`export.ts\` / \`export-pdf.ts\` locking statement validity.
    - Verification: Adversarial test harness \`scripts/test-m10-financial-reports.mjs\` verifies mathematical equilibrium, multi-currency isolation, temporal date constraints, and SHA-256 fingerprint determinism.
14. **Next Master Milestone: M11 (Transactional Communications & Notification Delivery Engine Rebuild)** — Designated as the next major work package.
15. **Production migration release gate** — Production deployment remains separately founder-authorized.`;

content = content.replace(
  /13\. \*\*Next Master Milestone.*?12\. \*\*Production migration release gate\*\*.*?founder-authorized\./s,
  m10Section
);

// Update Owner/Next Action section
content = content.replace(
  /\| Next bounded action \| Advance to \*\*M9 .*? \|/,
  `| Next bounded action | Advance to **M11 (Transactional Communications & Notification Delivery Engine Rebuild)** per PRD Section 10 and Section 26 sequence. |`
);
content = content.replace(
  /\| Permitted scope \| M9 events module.*? \|/,
  `| Permitted scope | M11 communications, notification delivery, and template management. No direct mutation of production. |`
);
content = content.replace(
  /\| Remaining acceptance \| M9 events tracking.*? \|/,
  `| Remaining acceptance | M11 transactional communication, audit trails, tenant segregation of notifications, and adversarial verification. |`
);

// Update footer Next Milestone
content = content.replace(
  /Next Milestone: `M8 \(Loans, Collateral & Repayment Engine Rebuild\)`/,
  `Next Milestone: \`M11 (Transactional Communications & Notification Delivery Engine Rebuild)\``
);

fs.writeFileSync(path, content);
console.log("Updated BUILD_STATUS.md successfully");
