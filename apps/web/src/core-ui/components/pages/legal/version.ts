/**
 * Version of the legal bundle (Privacy Policy + Terms of Service + Risk
 * Disclosure) shipped with this build.
 *
 * The authoritative value lives in `config.legal_policy_version` on the server,
 * so a revision can re-gate every user without a frontend deploy. This constant
 * is the fallback the client uses when the config fetch fails, and it must stay
 * in sync with `LEGAL_DOCUMENT_VERSIONS` in
 * `packages/shared/src/services/legal/index.ts`.
 *
 * Bumping this (and the config row) re-gates everyone: the comparison is string
 * equality, not ordering, which is what a material revision should do.
 */
export const LEGAL_POLICY_VERSION = '2026-08-25';

/**
 * Per-document revision dates. All three currently move together; they are kept
 * separate so a future revision touching only one document stays legible in the
 * acceptance records.
 */
export const PRIVACY_LAST_UPDATED = '2026-08-25';
export const TERMS_LAST_UPDATED = '2026-08-25';
export const RISK_LAST_UPDATED = '2026-08-25';
