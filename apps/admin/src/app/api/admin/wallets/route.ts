import { prisma } from '@vaquita/db';
import { NextResponse, type NextRequest } from 'next/server';
import { adminSecretOk } from '@/lib/adminSecret';

// The Wallets tab table: the persisted on-chain snapshots joined (by wallet
// address, app-layer) to profiles for identification. No RPC — reads the
// snapshot table written by the scrape/search endpoints. Loads instantly.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!adminSecretOk(req)) {
    return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });
  }

  const snapshots = await prisma.walletOnchainBalance.findMany({ orderBy: { scrapedAt: 'desc' } });

  const wallets = Array.from(new Set(snapshots.map((s) => s.walletAddress)));
  const profiles = wallets.length
    ? await prisma.profile.findMany({
        where: { walletAddress: { in: wallets } },
        select: { walletAddress: true, nickname: true, email: true },
      })
    : [];
  const byWallet = new Map(profiles.map((p) => [p.walletAddress, p]));

  // Locked = the wallet's active locked-pool deposits (confirmed, not yet
  // withdrawn), summed from the deposits table. DB-only, no RPC — always current.
  const deposits = wallets.length
    ? await prisma.deposit.findMany({
        where: { walletAddress: { in: wallets }, deletedAt: null, status: 'confirmed' },
        select: { walletAddress: true, amount: true, withdrawals: { select: { status: true } } },
      })
    : [];
  const lockedByWallet = new Map<string, number>();
  for (const d of deposits) {
    if (d.withdrawals.some((w) => w.status === 'confirmed')) continue;
    lockedByWallet.set(d.walletAddress, (lockedByWallet.get(d.walletAddress) ?? 0) + d.amount.toNumber());
  }

  const rows = snapshots.map((s) => {
    const blendUsdc = s.blendUsdc.toNumber();
    const vaultUsdc = s.vaultUsdc.toNumber();
    const locked = lockedByWallet.get(s.walletAddress) ?? 0;
    const profile = byWallet.get(s.walletAddress);
    return {
      wallet: s.walletAddress,
      nickname: profile?.nickname ?? null,
      email: profile?.email ?? null,
      blendUsdc,
      vaultUsdc,
      locked,
      vaquitaPositions: s.vaquitaPositions,
      total: blendUsdc + vaultUsdc + locked,
      lastError: s.lastError,
      scrapedAt: s.scrapedAt.toISOString(),
    };
  });

  return NextResponse.json({ data: { rows } });
}
