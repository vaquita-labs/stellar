import { Networks, StrKey } from '@stellar/stellar-sdk';
import { prisma } from '@vaquita/db';
import { getWalletPositions, type WalletPositionConfig } from '@vaquita/shared/services/stellar/wallet-positions';
import { NextResponse, type NextRequest } from 'next/server';
import { rpcUrlFor } from '@/lib/contractEvents';
import { adminSecretOk } from '@/lib/adminSecret';

// Throttled batch scrape for the Wallets tab, safe for public RPC: reads a page of
// profiles (or an explicit wallet list, for retry-failed) SEQUENTIALLY with a delay
// between wallets and exponential backoff on failure, upserting each snapshot.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const forbidden = () => NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });

// Tunables (env with safe defaults) — public RPC is rate-limited, so go gentle.
const SCRAPE_DELAY_MS = Number(process.env.SCRAPE_DELAY_MS ?? 300);
const DEFAULT_BATCH = Number(process.env.SCRAPE_BATCH_SIZE ?? 10);
const MAX_RETRIES = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isValidWallet = (a: string) => StrKey.isValidEd25519PublicKey(a) || StrKey.isValidContract(a);

/** Read one wallet, retrying with exponential backoff (public-RPC 429 friendly). */
async function readWithBackoff(wallet: string, cfg: WalletPositionConfig) {
  let attempt = 0;
  for (;;) {
    try {
      return await getWalletPositions(wallet, cfg);
    } catch (e) {
      attempt++;
      if (attempt > MAX_RETRIES) throw e;
      // Retry-After isn't surfaced by the shared read yet, so back off by attempt.
      await sleep(Math.min(1000 * 2 ** attempt, 8000));
    }
  }
}

export async function POST(req: NextRequest) {
  if (!adminSecretOk(req)) return forbidden();

  const body = (await req.json().catch(() => ({}))) as { offset?: number; limit?: number; wallets?: string[] };
  const limit = Math.max(1, Math.min(50, Number(body.limit ?? DEFAULT_BATCH)));
  const offset = Math.max(0, Number(body.offset ?? 0));

  const token =
    (await prisma.token.findFirst({ where: { defindexVaultContractAddress: { not: null }, deletedAt: null } })) ??
    (await prisma.token.findFirst({ where: { symbol: 'USDC', deletedAt: null } }));
  if (!token) {
    return NextResponse.json({ status: 'error', message: 'No USDC/vault token configured' }, { status: 404 });
  }

  const config = await prisma.config.findFirst({ orderBy: { id: 'asc' } });
  const networkPassphrase = config?.networkPassphrase === Networks.PUBLIC ? Networks.PUBLIC : Networks.TESTNET;
  const cfg: WalletPositionConfig = {
    rpcUrl: rpcUrlFor(config?.networkPassphrase),
    networkPassphrase,
    vaultId: token.defindexVaultContractAddress ?? '',
    blendPoolId: token.blendPoolContractAddress ?? null,
    usdcId: token.contractAddress?.split(',')?.[0] ?? '',
    decimals: token.decimals ?? 7,
  };

  const total = await prisma.profile.count();

  // Explicit wallet list = retry-failed; otherwise the next profiles page.
  const useExplicit = Array.isArray(body.wallets) && body.wallets.length > 0;
  const wallets = useExplicit
    ? body.wallets!.filter(isValidWallet)
    : (
        await prisma.profile.findMany({
          orderBy: { id: 'asc' },
          skip: offset,
          take: limit,
          select: { walletAddress: true },
        })
      )
        .map((p) => p.walletAddress)
        .filter(isValidWallet);

  const results: { wallet: string; blendUsdc: number; vaultUsdc: number; lastError: string | null }[] = [];
  for (let i = 0; i < wallets.length; i++) {
    const wallet = wallets[i]!;
    try {
      const { blendUsdc, vaultUsdc } = await readWithBackoff(wallet, cfg);
      await prisma.walletOnchainBalance.upsert({
        where: { walletAddress_tokenId: { walletAddress: wallet, tokenId: token.id } },
        create: { walletAddress: wallet, tokenId: token.id, blendUsdc, vaultUsdc, scrapedAt: new Date() },
        update: { blendUsdc, vaultUsdc, scrapedAt: new Date(), lastError: null },
      });
      results.push({ wallet, blendUsdc, vaultUsdc, lastError: null });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'read failed';
      // Preserve the last good balances on failure — only stamp the error.
      await prisma.walletOnchainBalance.upsert({
        where: { walletAddress_tokenId: { walletAddress: wallet, tokenId: token.id } },
        create: { walletAddress: wallet, tokenId: token.id, blendUsdc: 0, vaultUsdc: 0, scrapedAt: new Date(), lastError: message },
        update: { scrapedAt: new Date(), lastError: message },
      });
      results.push({ wallet, blendUsdc: 0, vaultUsdc: 0, lastError: message });
    }
    if (i < wallets.length - 1) await sleep(SCRAPE_DELAY_MS);
  }

  const nextOffset = useExplicit ? null : offset + limit < total ? offset + limit : null;
  return NextResponse.json({ data: { total, scraped: results.length, nextOffset, results } });
}
