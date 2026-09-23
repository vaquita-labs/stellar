// Inconsistency rules for the fiat ramp tables. They read only what the DB
// holds: the provider (Pollar) answers a transaction's status only to the
// session of the user who created it, so the admin cannot ask it what happened.
// What is left is the rows' own fields and, for the off-ramp, the on-chain
// hashes, which the page verifies against Horizon on demand.
//
// Both tables are reported by the client and closed lazily — a row is only
// expired/abandoned when that same wallet reads it again — so an open row from
// a wallet that never came back stays open forever. Most of the rules below are
// about telling those harmless leftovers apart from rows where money moved.

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type RampKind = 'onramp' | 'offramp';

export type IssueCode =
  | 'offramp_paid_but_closed'
  | 'offramp_paid_no_payout'
  | 'offramp_vault_no_order'
  | 'offramp_settled_no_payment'
  | 'offramp_stuck'
  | 'onramp_expired_open'
  | 'onramp_stale_open'
  | 'onramp_duplicate_open';

export interface RampIssue {
  code: IssueCode;
  severity: Severity;
  title: string;
  detail: string;
}

export interface OnrampRow {
  kind: 'onramp';
  id: string;
  walletAddress: string;
  nickname: string | null;
  providerTxId: string;
  provider: string;
  country: string;
  amountFiat: string;
  currency: string;
  status: string;
  expiresAt: string | null;
  errorReason: string | null;
  createdAt: string;
  updatedAt: string;
  issues: RampIssue[];
}

export interface OfframpRow {
  kind: 'offramp';
  id: string;
  walletAddress: string;
  nickname: string | null;
  providerTxId: string | null;
  provider: string | null;
  country: string;
  rail: string | null;
  amountFiat: string;
  currency: string;
  usdcAmount: string | null;
  vaultWithdrawHash: string | null;
  paymentHash: string | null;
  step: string;
  status: string;
  errorReason: string | null;
  createdAt: string;
  updatedAt: string;
  issues: RampIssue[];
}

export type RampRow = OnrampRow | OfframpRow;

const HOUR = 60 * 60 * 1000;

// Same grace the lazy sweep uses (ONRAMP_/OFFRAMP_ABANDON_GRACE_MS): past it,
// the app itself would have closed the row had the user come back.
const ABANDON_GRACE_MS = 24 * HOUR;

// Once the USDC reached the provider, a payout usually confirms within minutes.
// Two hours is long enough not to flag a slow rail and short enough to chase a
// user who is still waiting for their money.
const PAYOUT_OVERDUE_MS = 2 * HOUR;

// An on-ramp row written without `expiresAt` has no deadline to measure
// against, so its age from creation stands in for one.
const ONRAMP_STALE_MS = 48 * HOUR;

export const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const isOpenOnramp = (status: string) => status === 'pending' || status === 'paid';

const age = (iso: string, now: number) => now - new Date(iso).getTime();

const hoursLabel = (ms: number) => {
  const h = Math.floor(ms / HOUR);
  return h < 48 ? `${h} h` : `${Math.floor(h / 24)} d`;
};

export function offrampIssues(r: Omit<OfframpRow, 'issues'>, now: number): RampIssue[] {
  const issues: RampIssue[] = [];
  const idle = age(r.updatedAt, now);

  if (r.paymentHash && (r.status === 'failed' || r.status === 'abandoned')) {
    issues.push({
      code: 'offramp_paid_but_closed',
      severity: 'critical',
      title: `USDC sent, row ${r.status}`,
      detail:
        'The payment to the provider has a hash but the withdrawal was closed without settling. Check in Pollar whether the fiat payout went out or the USDC has to be refunded.',
    });
  }

  if (r.paymentHash && r.status === 'pending' && idle > PAYOUT_OVERDUE_MS) {
    issues.push({
      code: 'offramp_paid_no_payout',
      severity: 'critical',
      title: 'USDC sent, payout unconfirmed',
      detail: `The USDC reached the provider ${hoursLabel(idle)} ago and the fiat payout was never confirmed.`,
    });
  }

  if (r.vaultWithdrawHash && !r.providerTxId && r.status !== 'settled') {
    issues.push({
      code: 'offramp_vault_no_order',
      severity: 'high',
      title: 'Left the vault, no provider order',
      detail:
        'The USDC was withdrawn from the vault to the user wallet but the provider order was never created. The funds should still be in the wallet.',
    });
  }

  if (r.status === 'settled' && !r.paymentHash) {
    issues.push({
      code: 'offramp_settled_no_payment',
      severity: 'high',
      title: 'Settled without a payment hash',
      detail: 'The row says settled but never recorded the USDC payment to the provider.',
    });
  }

  // Skipped when a sharper rule above already explains the open row.
  if (r.status === 'pending' && idle > ABANDON_GRACE_MS && issues.length === 0) {
    issues.push({
      code: 'offramp_stuck',
      severity: 'medium',
      title: `Stuck on "${r.step}"`,
      detail: `Open and untouched for ${hoursLabel(idle)}. No money movement recorded past this step.`,
    });
  }

  return issues;
}

export function onrampIssues(
  r: Omit<OnrampRow, 'issues'>,
  now: number,
  openByWallet: Map<string, number>
): RampIssue[] {
  if (!isOpenOnramp(r.status)) return [];
  const issues: RampIssue[] = [];

  if (r.expiresAt && now - new Date(r.expiresAt).getTime() > ABANDON_GRACE_MS) {
    issues.push({
      code: 'onramp_expired_open',
      severity: 'medium',
      title: 'Expired but still open',
      detail: `The payment code expired ${hoursLabel(now - new Date(r.expiresAt).getTime())} ago. Either nobody paid it or it was settled outside the app and never written back.`,
    });
  } else if (!r.expiresAt && age(r.createdAt, now) > ONRAMP_STALE_MS) {
    issues.push({
      code: 'onramp_stale_open',
      severity: 'medium',
      title: 'Open with no expiry',
      detail: `Open for ${hoursLabel(age(r.createdAt, now))} and it has no expiry date to close it.`,
    });
  }

  if ((openByWallet.get(r.walletAddress) ?? 0) > 1) {
    issues.push({
      code: 'onramp_duplicate_open',
      severity: 'low',
      title: 'Several open purchases',
      detail: 'This wallet has more than one open purchase. The app only resumes one of them.',
    });
  }

  return issues;
}

export function countOpenOnrampByWallet(rows: { walletAddress: string; status: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (isOpenOnramp(r.status)) counts.set(r.walletAddress, (counts.get(r.walletAddress) ?? 0) + 1);
  }
  return counts;
}

export const worstSeverity = (issues: RampIssue[]): Severity | null =>
  issues.reduce<Severity | null>(
    (worst, i) => (worst === null || SEVERITY_RANK[i.severity] < SEVERITY_RANK[worst] ? i.severity : worst),
    null
  );
