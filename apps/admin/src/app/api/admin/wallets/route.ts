import { prisma } from '@vaquita/db';
import { NextResponse, type NextRequest } from 'next/server';
import { adminSecretOk } from '@/lib/adminSecret';
import { getVaquitaPositionsByWalletToken, positionKey } from '@vaquita/shared/services/wallets/vaquitaPositions';
import { getSupportedTokenIds } from '@vaquita/shared/services/wallets/onchainBalances';

// The Wallets tab table: the persisted on-chain snapshots (one per wallet+token)
// joined (by wallet address, app-layer) to profiles. Locked is computed per
// (wallet, token_id) from the deposits table — DB-only, no RPC. Loads instantly.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!adminSecretOk(req)) {
    return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });
  }

  // Only supported tokens. Rows for a retired token are never refreshed again,
  // so they linger at a stale balance — and when two tokens share a DeFindex
  // vault (production did) the "All tokens" totals count that vault twice.
  const snapshots = await prisma.walletBalance.findMany({
    where: { tokenId: { in: await getSupportedTokenIds() } },
    orderBy: { scrapedAt: 'desc' },
  });

  const wallets = Array.from(new Set(snapshots.map((s) => s.walletAddress)));
  const profiles = wallets.length
    ? await prisma.profile.findMany({
        where: { walletAddress: { in: wallets } },
        select: { walletAddress: true, nickname: true, email: true },
      })
    : [];
  const byWallet = new Map(profiles.map((p) => [p.walletAddress, p]));

  // Locked per (wallet, token_id): active locked-pool deposits, always current.
  const positions = await getVaquitaPositionsByWalletToken(wallets);

  const rows = snapshots.map((s) => {
    const blendUsdc = s.blendUsdc.toNumber();
    const vaultUsdc = s.vaultUsdc.toNumber();
    const locked = (positions.get(positionKey(s.walletAddress, s.tokenId)) ?? []).reduce(
      (sum, p) => sum + p.amount,
      0,
    );
    const profile = byWallet.get(s.walletAddress);
    return {
      wallet: s.walletAddress,
      tokenId: s.tokenId,
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
