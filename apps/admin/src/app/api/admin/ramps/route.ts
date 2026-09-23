import { Networks } from '@stellar/stellar-sdk';
import { prisma } from '@vaquita/db';
import { NextResponse, type NextRequest } from 'next/server';
import { adminSecretOk } from '@/lib/adminSecret';
import {
  countOpenOnrampByWallet,
  offrampIssues,
  onrampIssues,
  type OfframpRow,
  type OnrampRow,
} from '@/lib/rampIssues';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;

export async function GET(req: NextRequest) {
  if (!adminSecretOk(req)) {
    return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });
  }

  const daysParam = Number(req.nextUrl.searchParams.get('days'));
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, MAX_DAYS) : DEFAULT_DAYS;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const now = Date.now();

  // Both migrations are applied by hand per environment, so a table can be
  // missing; querying it would throw and blank the whole page.
  const [[tables], config] = await Promise.all([
    prisma.$queryRaw<{ onramp: boolean; offramp: boolean }[]>`
    select to_regclass('public.onramp_purchases') is not null as onramp,
           to_regclass('public.offramp_withdrawals') is not null as offramp
  `,
    prisma.config.findFirst({ orderBy: { id: 'asc' }, select: { networkPassphrase: true } }),
  ]);

  // The window bounds history, never the rows that need attention: every open
  // row and every off-ramp that moved money without settling is returned
  // whatever its age, or the oldest problems would be the ones a window hides.
  const [onramp, offramp] = await Promise.all([
    tables?.onramp
      ? prisma.onrampPurchase.findMany({
          where: { deletedAt: null, OR: [{ createdAt: { gte: since } }, { status: { in: ['pending', 'paid'] } }] },
          orderBy: { createdAt: 'desc' },
        })
      : [],
    tables?.offramp
      ? prisma.offrampWithdrawal.findMany({
          where: {
            deletedAt: null,
            OR: [
              { createdAt: { gte: since } },
              { status: 'pending' },
              {
                status: { not: 'settled' },
                OR: [{ paymentHash: { not: null } }, { vaultWithdrawHash: { not: null } }],
              },
              { status: 'settled', paymentHash: null },
            ],
          },
          orderBy: { createdAt: 'desc' },
        })
      : [],
  ]);

  const wallets = Array.from(new Set([...onramp, ...offramp].map((r) => r.walletAddress)));
  const profiles = wallets.length
    ? await prisma.profile.findMany({
        where: { walletAddress: { in: wallets } },
        select: { walletAddress: true, nickname: true, email: true },
      })
    : [];
  const nameOf = new Map(profiles.map((p) => [p.walletAddress, p.nickname ?? p.email ?? null]));

  const openByWallet = countOpenOnrampByWallet(onramp);

  const onrampRows: OnrampRow[] = onramp.map((r) => {
    const base = {
      kind: 'onramp' as const,
      id: r.id,
      walletAddress: r.walletAddress,
      nickname: nameOf.get(r.walletAddress) ?? null,
      providerTxId: r.providerTxId,
      provider: r.provider,
      country: r.country,
      amountFiat: r.amountFiat,
      currency: r.currency,
      status: r.status,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      errorReason: r.errorReason,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
    return { ...base, issues: onrampIssues(base, now, openByWallet) };
  });

  const offrampRows: OfframpRow[] = offramp.map((r) => {
    const base = {
      kind: 'offramp' as const,
      id: r.id,
      walletAddress: r.walletAddress,
      nickname: nameOf.get(r.walletAddress) ?? null,
      providerTxId: r.providerTxId,
      provider: r.provider,
      country: r.country,
      rail: r.rail,
      amountFiat: r.amountFiat,
      currency: r.currency,
      usdcAmount: r.usdcAmount,
      vaultWithdrawHash: r.vaultWithdrawHash,
      paymentHash: r.paymentHash,
      step: r.step,
      status: r.status,
      errorReason: r.errorReason,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
    return { ...base, issues: offrampIssues(base, now) };
  });

  return NextResponse.json({
    data: {
      days,
      network: config?.networkPassphrase === Networks.PUBLIC ? 'public' : 'testnet',
      tables: { onramp: tables?.onramp ?? false, offramp: tables?.offramp ?? false },
      onramp: onrampRows,
      offramp: offrampRows,
    },
  });
}
