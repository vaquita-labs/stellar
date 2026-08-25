import { prisma } from '@vaquita/db';

/**
 * Bundle version shipped with this build, used when the singleton `config` row
 * is missing or unreadable. Mirrors the DEFAULT_GAME_DAY_LENGTH_MS pattern: the
 * gate must always have a version to compare against, because a config read
 * failure that left the required version empty would silently let every user
 * past the acceptance gate.
 */
export const DEFAULT_LEGAL_POLICY_VERSION = '2026-08-25';

/**
 * Per-document revision dates inside the current bundle. Stamped server-side on
 * every acceptance so a later revision that touches only one document is still
 * reconstructable from the record. The client never supplies these — it would
 * be trivially forgeable and the record has to be the server's account of what
 * was presented.
 */
export const LEGAL_DOCUMENT_VERSIONS = {
  privacy: '2026-08-25',
  terms: '2026-08-25',
  risk: '2026-08-25',
} as const;

/** Per-document versions pinned inside a bundle acceptance. */
export interface AcceptedDocumentVersions {
  privacy: string;
  terms: string;
  risk: string;
}

export interface LegalAcceptanceRecord {
  policyVersion: string;
  acceptedDocuments: Partial<AcceptedDocumentVersions>;
  jurisdictionAttested: boolean;
  acceptedAt: string;
}

/**
 * The bundle version users must currently have accepted, read live from the
 * singleton `config`. Falls back to the build-time default so the endpoint never
 * fails open.
 */
export const getRequiredPolicyVersion = async (): Promise<string> => {
  try {
    const config = await prisma.config.findFirst({
      select: { legalPolicyVersion: true },
    });
    return config?.legalPolicyVersion || DEFAULT_LEGAL_POLICY_VERSION;
  } catch (error) {
    console.error('Error on getRequiredPolicyVersion', error);
    return DEFAULT_LEGAL_POLICY_VERSION;
  }
};

/**
 * Most recent acceptance for a profile, or null if the user has never accepted.
 * Read on every profile load, which is what `idx_legal_acceptances_profile`
 * (profile_id, accepted_at DESC) exists for.
 */
export const getLatestAcceptance = async (
  profileId: number,
): Promise<LegalAcceptanceRecord | null> => {
  const row = await prisma.legalAcceptance.findFirst({
    where: { profileId },
    orderBy: { acceptedAt: 'desc' },
    select: {
      policyVersion: true,
      acceptedDocuments: true,
      jurisdictionAttested: true,
      acceptedAt: true,
    },
  });
  if (!row) return null;
  return {
    policyVersion: row.policyVersion,
    acceptedDocuments: (row.acceptedDocuments as Partial<AcceptedDocumentVersions>) ?? {},
    jurisdictionAttested: row.jurisdictionAttested,
    acceptedAt: row.acceptedAt.toISOString(),
  };
};

/**
 * Version the profile has accepted, or '' when it never has. Flattened to a
 * string for {@link ProfileResponseDTO}, whose contract is "no nulls". Swallows
 * read errors into '' so a transient DB hiccup re-shows the gate (fail closed)
 * rather than dropping a user into the app unrecorded.
 */
export const getAcceptedPolicyVersion = async (profileId: number): Promise<string> => {
  try {
    const latest = await getLatestAcceptance(profileId);
    return latest?.policyVersion ?? '';
  } catch (error) {
    console.error('Error on getAcceptedPolicyVersion', error);
    return '';
  }
};

export interface RecordAcceptanceInput {
  profileId: number;
  walletAddress: string;
  policyVersion: string;
  acceptedDocuments: Partial<AcceptedDocumentVersions>;
  jurisdictionAttested: boolean;
  countryCode?: string | null;
  userAgent?: string | null;
  locale?: string | null;
}

/**
 * Appends one acceptance row. Never updates in place — the history is the point,
 * and re-accepting after a policy revision must leave both rows behind.
 */
export const recordAcceptance = async (input: RecordAcceptanceInput) => {
  return prisma.legalAcceptance.create({
    data: {
      profileId: input.profileId,
      walletAddress: input.walletAddress,
      policyVersion: input.policyVersion,
      acceptedDocuments: input.acceptedDocuments as object,
      jurisdictionAttested: input.jurisdictionAttested,
      // Column is CHAR(2); anything else is dropped rather than truncated.
      countryCode:
        input.countryCode && input.countryCode.length === 2
          ? input.countryCode.toUpperCase()
          : null,
      userAgent: input.userAgent?.slice(0, 300) ?? null,
      locale: input.locale?.slice(0, 10) ?? null,
    },
  });
};
