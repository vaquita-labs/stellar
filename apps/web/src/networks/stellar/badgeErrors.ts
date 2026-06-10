/**
 * Translates raw Soroban/Pollar mint failures into a small set of stable
 * "reason" slugs so the UI never shows the user a HostError dump.
 *
 * Soroban surfaces contract panics as `"Error(Contract, #N)"`, where N maps to
 * the `BadgeError` enum in `contracts/vaquita-badges/src/error.rs`. Anything we
 * can't recognise (wallet rejection, network blips, off-chain claim failures)
 * collapses to a heuristic slug or `'generic'`. Each slug has a matching i18n
 * key under `achievements.mintError.<slug>`.
 */

/** Mirrors `BadgeError` in `contracts/vaquita-badges/src/error.rs`. */
export const BadgeContractErrorCode = {
  AlreadyInitialized: 1,
  AlreadyClaimed: 2,
  SoulboundToken: 3,
  ClaimExpired: 4,
  Unauthorized: 5,
  EditionCapReached: 6,
  NotInitialized: 7,
  Paused: 8,
  UpgradeNotProposed: 9,
  UpgradeNotReady: 10,
  UpgradeLocked: 11,
} as const;

/**
 * Stable reason slugs surfaced to the UI. Keep in sync with the
 * `achievements.mintError.*` keys in the locale files.
 */
export type BadgeMintErrorReason =
  | 'alreadyClaimed'
  | 'claimExpired'
  | 'soulbound'
  | 'unauthorized'
  | 'editionCapReached'
  | 'paused'
  | 'notReady'
  | 'rejected'
  | 'network'
  | 'generic';

const CODE_TO_REASON: Record<number, BadgeMintErrorReason> = {
  [BadgeContractErrorCode.AlreadyClaimed]: 'alreadyClaimed',
  [BadgeContractErrorCode.ClaimExpired]: 'claimExpired',
  [BadgeContractErrorCode.SoulboundToken]: 'soulbound',
  [BadgeContractErrorCode.Unauthorized]: 'unauthorized',
  [BadgeContractErrorCode.EditionCapReached]: 'editionCapReached',
  [BadgeContractErrorCode.Paused]: 'paused',
  // Init/upgrade states all mean "the contract isn't ready for you right now".
  [BadgeContractErrorCode.NotInitialized]: 'notReady',
  [BadgeContractErrorCode.AlreadyInitialized]: 'notReady',
  [BadgeContractErrorCode.UpgradeNotProposed]: 'notReady',
  [BadgeContractErrorCode.UpgradeNotReady]: 'notReady',
  [BadgeContractErrorCode.UpgradeLocked]: 'notReady',
};

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err ?? '');
  } catch {
    return '';
  }
}

/** Extract a `BadgeError` numeric code from a Soroban error string, if present. */
function parseContractErrorCode(message: string): number | null {
  const match = /Error\(Contract,\s*#(\d+)\)/.exec(message);
  if (!match?.[1]) return null;
  return parseInt(match[1], 10);
}

/**
 * Map an arbitrary thrown value from the mint flow to a UI reason slug. Never
 * throws; defaults to `'generic'`. The slug is meant to index into
 * `achievements.mintError.<slug>` for the localized, user-facing message.
 */
export function parseBadgeMintError(err: unknown): BadgeMintErrorReason {
  const message = toMessage(err);

  const code = parseContractErrorCode(message);
  if (code !== null) {
    return CODE_TO_REASON[code] ?? 'generic';
  }

  const lower = message.toLowerCase();

  // Wallet declined / user dismissed the signing prompt.
  if (
    lower.includes('reject') ||
    lower.includes('declined') ||
    lower.includes('denied') ||
    lower.includes('cancel') || // "canceled" / "cancelled"
    lower.includes('user refused') ||
    lower.includes('abort')
  ) {
    return 'rejected';
  }

  // Connectivity / RPC issues — anything that smells like a transport failure.
  if (
    lower.includes('network') ||
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('fetch') ||
    lower.includes('connection') ||
    lower.includes('failed to fetch')
  ) {
    return 'network';
  }

  return 'generic';
}
