# Milestone 14: Community Cards & Social Proof Runbook

This document defines the architectural invariants and strict privacy guarantees established in Milestone 14 for the VillageClaq community card sharing engine.

## 1. Zero-Leakage Privacy Projection Model

The `community_share_cards` schema governs all publicly verifiable social proof.
- **Omission Invariant:** The schema and `issue_member_share_card` RPC enforces absolute sanitization. No internal member UUIDs, financial dues/debt, election ballots, phone numbers, or email addresses can mathematically enter the `display_data` JSONB projection.
- **Tenant Validation:** Generation strictly asserts that the target organization has explicitly permitted public sharing (`allow_public_cards = true`) and the caller is an active member.

## 2. Cryptographic Edge Verification

- **Opaque Tokens:** Shared cards generate 16-byte cryptographically secure random tokens. They act as one-way public verification identifiers.
- **Verification Ingress:** The `verify_public_share_token` RPC securely processes unauthenticated inputs from edge links without querying unauthorized tenant bounds or exposing relational table structures.
- **Cross-Tenant Revocation Protection:** Only the exact card owner or a designated group admin can invoke `revoke_share_card`.

## 3. Client-Side Runtime Defenses

- **Sanitization Bridge:** The `sanitizePublicCardPayload` utility in `src/lib/community-card-payload.ts` enforces a strict allowlist. Even if the upstream RPC leaks extraneous keys, this runtime barrier strips them before the React rendering lifecycle.
- **Cache Invalidation:** The React Query hook architecture ensures that when a card is revoked, the cached verification proof is immediately invalidated, aligning client UI gracefully with the canonical F3 ledger.

## 4. Public Rendering & Attribution

- **Non-Intrusive Validation:** The `verify-card/[token]` route serves as an ultra-lightweight, tracker-free validation bridge. Revoked or invalid tokens render a strictly neutral fallback without confirming or denying the historical existence of the token.
- **Growth Loop Attribution:** Valid public cards securely link back to the VillageClaq ingress using safe anchor attributes (`rel="noopener noreferrer"`) wrapped in a tasteful "Powered by VillageClaq" badge.

**Status:** Certified under the Universal Adversarial Audit Standard. Ready for Milestone 15.
