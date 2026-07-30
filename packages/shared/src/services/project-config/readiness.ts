import type { Token } from '@vaquita/db';

/** One thing a token is missing, and what it costs the app. */
export type TokenReadinessGap = {
  /** Prisma field name, so the admin can point at the input to fill. */
  field: string;
  /** Human name of that field. */
  label: string;
  /** What breaks without it. */
  reason: string;
};

export type TokenReadiness = {
  /** True when the app can offer this token end to end. */
  usable: boolean;
  gaps: TokenReadinessGap[];
};

/**
 * Everything the app dereferences for a token, with the flow that needs it.
 * A token missing any of these does not fail loudly — it reads a balance of 0,
 * detects no idle funds, or shows an APY of 0 — so the check lives here once and
 * the app never offers a token it cannot fully serve.
 */
const REQUIREMENTS: Array<TokenReadinessGap & { present: (t: Token) => boolean }> = [
  {
    field: 'isSupported',
    label: 'Supported flag',
    reason: 'Turned off on purpose; the app treats the token as retired.',
    present: (t) => t.isSupported,
  },
  {
    field: 'contractAddress',
    label: 'Token contract',
    reason: 'Every balance read and transfer targets this SAC.',
    present: (t) => !!t.contractAddress,
  },
  {
    field: 'issuer',
    label: 'Issuer',
    reason:
      'Tells this asset apart from same-code assets from other issuers. Idle-funds detection filters on it, so without it incoming money is never noticed.',
    present: (t) => !!t.issuer,
  },
  {
    field: 'decimals',
    label: 'Decimals',
    reason: 'Every amount is scaled by 10 ** decimals; a missing value misreads balances by orders of magnitude.',
    present: (t) => !!t.decimals,
  },
  {
    field: 'vaquitaContractAddress',
    label: 'Vaquita pool',
    reason: 'Holds the locked positions. Without it there are no term deposits.',
    present: (t) => !!t.vaquitaContractAddress,
  },
  {
    field: 'defindexVaultContractAddress',
    label: 'DeFindex vault',
    reason:
      'Where the pool forwards locked funds, and the source of both the accrued interest per deposit and the protocol APY.',
    present: (t) => !!t.defindexVaultContractAddress,
  },
  {
    field: 'blendPoolContractAddress',
    label: 'Blend pool',
    reason:
      'The passive balance and the wallet USDC read both resolve through it, so the vault path depends on it too.',
    present: (t) => !!t.blendPoolContractAddress,
  },
];

/**
 * Whether the app can offer this token, and what is missing when it cannot.
 * The single definition of "properly configured": the public project config
 * filters on it so the app never lists a half-configured token, and the admin
 * shows the gaps so someone can fill them.
 */
export const tokenReadiness = (token: Token): TokenReadiness => {
  const gaps = REQUIREMENTS.filter((r) => !r.present(token)).map(({ field, label, reason }) => ({
    field,
    label,
    reason,
  }));
  return { usable: gaps.length === 0, gaps };
};

/** Shorthand for the filter in the public config. */
export const isTokenUsable = (token: Token): boolean => tokenReadiness(token).usable;
