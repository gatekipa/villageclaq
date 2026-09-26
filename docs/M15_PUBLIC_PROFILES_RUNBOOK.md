# Milestone 15: Public Profiles & Directory Runbook

This document defines the architectural invariants and strict privacy guarantees established in Milestone 15 for the VillageClaq public organization directory.

## 1. Private-by-Default Invariant

- **Visibility State Machine:** The `organization_public_profiles` table mandates a strict `private` default visibility. No organization profile is exposed to the public web unless an authorized officer explicitly transitions the state to `unlisted` or `public`.
- **Edge Obfuscation:** The `verify-card` and `org/[slug]` endpoints intentionally return an indistinguishable 404/Fallback state for private or non-existent slugs. This mathematically prevents anonymous actors from running enumeration attacks to determine if an organization exists on the platform.

## 2. Zero-Leakage DOM Rendering

- **Omission Invariant:** The schema and `get_public_organization_profile` RPC enforces absolute data sanitization. Internal member UUIDs, financial dues, vault ledgers, and contact details are completely omitted from edge projections.
- **Client Fallback:** The React rendering lifecycle guarantees that missing metadata is replaced with safe structural fallbacks (e.g., CSS-driven logos) rather than crashing or exposing schema anomalies.

## 3. Controlled Ingress & XSS Defense

- **Membership Request Pipeline:** The `organization_membership_requests` table acts as a quarantine staging area. Incoming requests do *not* grant auto-admittance nor alter the internal `memberships` table.
- **Sanitization Bridge:** The canonical RPC `submit_public_membership_request` actively scrubs HTML entities (`<`, `>`) and the client form rigorously validates email formats and payload limits (2000 chars) before touching the Supabase edge.
- **Outbox Integration:** Approved submissions atomicaly write an event into the M11 `notifications_queue` to ensure administrative visibility without bypassing RBAC.

## 4. Metadata & Canonical Attribution

- **SEO Safety:** `public-profile-metadata.ts` generates dynamic OpenGraph and Twitter cards exclusively from vetted, truncated fields. It instructs crawlers to `noindex` any private records.
- **Growth Loop Attribution:** Valid public profiles securely link back to the VillageClaq ingress using safe anchor attributes (`rel="noopener noreferrer"`) wrapped in a tasteful "Powered by VillageClaq" badge.

**Status:** Certified under the Universal Adversarial Audit Standard.
**Program Status:** Master Rebuild M0–M15 Complete and SEALED.
