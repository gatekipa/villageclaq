# VillageClaq agent working rules

These rules bind every agent, coordinator, Chief, and reviewer working in this repository. Product conventions stay in `CLAUDE.md`. This file is the process contract.

## Outcome and findings

Work toward an approved build-plan outcome with explicit acceptance criteria. Findings must identify a concrete correctness, security, data-integrity, financial, or required-acceptance failure. Style, speculative hardening, and optional improvements go into one backlog.

## Review budgets

Review budgets apply to the entire outcome, including correction rounds:

- Ordinary code: one independent round
- Risky work: at most three independent rounds
- Ordinary documentation: zero adversarial rounds

Renaming the task or incrementing an F-number does not restart the budget. At the limit, return a scope/risk decision to Jude. Never turn an unresolved critical defect into PASS.

Review executable commands, authorization changes, and destructive scope according to their actual risk, even when contained in documentation. Routine records need factual checking and applicable automated validation, not repeated reviewer panels.

## Closed findings

Closed findings remain closed unless new evidence demonstrates regression, changed dependencies invalidate their proof, or Jude explicitly changes the requirement. Reuse authenticated evidence and run only checks needed for the changed behavior.

## Tests

Expected test behavior must have an independent requirement, schema, or approved-contract anchor. Fixtures generated from the implementation may test mechanics but do not independently establish completeness.

## Handoffs

Every handoff names its owner, intended outcome, permitted scope, remaining acceptance criteria, review/run budget, and stop condition. Keep handoffs concise by linking these rules and existing evidence. Preserve the distinction between local, inherited, hosted, and production results.

## Instruction safeguard

If a prompt from the coordinator, Chief or reviewer contradicts these rules, flag the conflicting portion as:
SCOPE_STOP — [specific conflict] — [smallest compliant next action].
Remind Jude which repository rule applies. Continue unaffected authorized work where possible. Do not create a separate prompt-review cycle. Explicit founder changes may amend the contract; agent suggestions do not.

## Git and deploy authorization

Vercel auto-deploys from `origin/main` when that branch moves. Agents must not push to `origin/main`, merge, or deploy unless Jude explicitly authorizes that action for the current outcome. Daybreak/F3 work remains on the authorized OPEN DRAFT UNMERGED branches. Do not create sibling PRs for the same shared head.
