# Milestone 13: Group Referrals & Ingress Architecture Runbook

This document defines the architectural invariants and strict privacy guarantees established in Milestone 13 for the VillageClaq attribution and referral engine.

## 1. Zero-Trust Referral Attribution Model

The `organization_referrals` schema is the canonical ledger for tracing product-led growth through group invitations. 
- **State Machine Integrity:** Referrals strictly transition through `issued` -> `claimed` -> `activated`.
- **Zero Client Mutations:** The API absolutely revokes `INSERT`, `UPDATE`, and `DELETE` privileges from `authenticated` and `anon` clients.
- **Canonical Edge RPCs:** Referrals can only be manipulated via `generate_group_referral_link` and `claim_group_referral`. Both functions execute under the `SECURITY DEFINER SET search_path = ''` lockdown to prevent schema-path hijacking.

## 2. Tenant Isolation & Cryptographic Privacy Guarantees

- **Referrer Isolation:** A referrer can exclusively read referrals originating from their active `group_id` matching their `user_id`.
- **Public Opaque Tokens:** Tokens are randomly generated (`gen_random_bytes(16)`) hex strings. They expose **zero** financial data, member PII, or internal tenant UUIDs on the public edge.
- **Referee Isolation:** Upon a successful claim, the newly provisioned organization (`activated_group_id`) remains entirely shielded. The original referrer is notified via the M11 Outbox engine without ever being granted cross-tenant introspection.

## 3. Client Ingress Buffering

To protect the registration funnel, token claims execute invisibly:
- **`sessionStorage` Persistence:** Incoming tokens are preserved in the DOM without persisting them into cross-origin URLs.
- **Graceful Degradation:** During new group provisioning, `useReferralIngress` attempts to invoke `claim_group_referral`. If the token is expired, corrupted, or revoked, the transaction gracefully falls back to a standard, unreferred organization creation. Growth mechanics will never block the user creation pipeline.

## 4. WhatsApp & Deep-Linking Defenses

The `referral-share.ts` formatting engine acts as the edge sanitizer:
- **Tracker Dropping:** Maliciously injected query parameters (`utm_*`, trackers, etc.) are algorithmically dropped before the WhatsApp schema is assembled.
- **URL Safety:** Standard `encodeURIComponent` correctly serializes English and French localized text to prevent deep-link breakage and XSS.

**Status:** Certified under the Universal Adversarial Audit Standard. Ready for Milestone 14.
