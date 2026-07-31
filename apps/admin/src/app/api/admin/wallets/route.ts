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

  const rows = snapshots.map((s) => {
    const blendUsdc = s.blendUsdc.toNumber();
    const vaultUsdc = s.vaultUsdc.toNumber();
    const profile = byWallet.get(s.walletAddress);
    return {
      wallet: s.walletAddress,
      nickname: profile?.nickname ?? null,
      email: profile?.email ?? null,
      blendUsdc,
      vaultUsdc,
      total: blendUsdc + vaultUsdc,
      lastError: s.lastError,
      scrapedAt: s.scrapedAt.toISOString(),
    };
  });

  return NextResponse.json({ data: { rows } });
}
