# VC-05 required-check policy read

**Date:** 2026-09-26. **Owner:** Daybreak Blue. **Candidate code:** `cb5581dff8bb7b9a9b990ede5509bff7d246f21b` (parent core repair `4f90266e9716ad11c55fce6443359a1260f9e172`).

## Actual visible GitHub enforcement

One authorized administration read of `gatekipa/villageclaq` found `main.protected=false`, branch-protection enabled `false`, required status checks enforcement `off`, and empty required contexts/checks. Ruleset listing was empty. The candidate repository has no `.github` workflows. The detailed `/branches/main/protection` endpoint returned HTTP 403 to the integration. Therefore no enforced repository checks were observed; any policy outside this integration's visibility is an administrator question, not an inferred gate. A Vercel READY/success status is build evidence only, not product qualification.

## PRD/repository acceptance versus advisory lint

The master PRD §24 and repository instructions retain their merge/release acceptance requirements regardless of GitHub branch protection. For the core repair SHA, `tsc`, targeted changed-file ESLint, network-enabled Next build, product money 30/30, receipt producer 13/13, and bulk receipts 9/9 passed (see [prior exact-SHA gate record](vc05-current-gates.result.txt)). On the audit-display code SHA, `npx tsc --noEmit` passed and a network-enabled `npm run build` passed. The first sandboxed build failed only at four Google Fonts network fetches; it did not reach an application compile failure.

Repository-wide lint at the earlier exact SHA had 82 errors and 398 warnings, including 53 source errors, matching the recorded baseline error counts. Targeted ESLint on the two audit-display pages finds an existing dashboard `Date.now()` render-purity error at line 765 and unused `formatTime` warning; Activity Log adds no lint error. These are advisory debt unless an actual required gate makes them blocking. No gate was weakened or invented.
