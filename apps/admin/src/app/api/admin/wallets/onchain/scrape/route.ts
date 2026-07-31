import { Networks, StrKey } from '@stellar/stellar-sdk';
import { Prisma, prisma } from '@vaquita/db';
import { getWalletPositions, type WalletPositionConfig } from '@vaquita/shared/services/stellar/wallet-positions';
import { NextResponse, type NextRequest } from 'next/server';
import { rpcUrlFor } from '@/lib/contractEvents';
import { adminSecretOk } from '@/lib/adminSecret';
import { getVaquitaPositionsByWalletToken, positionKey } from '@/lib/vaquitaPositions';

// Throttled batch scrape for the Wallets tab, safe for public RPC: reads a page of
// profiles (or an explicit wallet list, for retry-failed) SEQUENTIALLY, once per
// supported token, upserting a snapshot per (wallet, token_id). Token ids are never
// mixed — even two tokens on the same contract get their own row (their locked-pool
// deposits differ by token_id). Identical on-chain reads are de-duped per wallet.
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
      await sleep(Math.min(1000 * 2 ** attempt, 8000));
    }
  }
}

export async function POST(req: NextRequest) {
  if (!adminSecretOk(req)) return forbidden();

  const body = (await req.json().catch(() => ({}))) as { offset?: number; limit?: number; wallets?: string[] };
  const limit = Math.max(1, Math.min(50, Number(body.limit ?? DEFAULT_BATCH)));
  const offset = Math.max(0, Number(body.offset ?? 0));

  const tokens = await prisma.token.findMany({ where: { isSupported: true, deletedAt: null } });
  if (!tokens.length) {
    return NextResponse.json({ status: 'error', message: 'No supported token configured' }, { status: 404 });
  }

  const config = await prisma.config.findFirst({ orderBy: { id: 'asc' } });
  const networkPassphrase = config?.networkPassphrase === Networks.PUBLIC ? Networks.PUBLIC : Networks.TESTNET;
  const rpcUrl = rpcUrlFor(config?.networkPassphrase);
  const cfgFor = (token: (typeof tokens)[number]): WalletPositionConfig => ({
    rpcUrl,
    networkPassphrase,
    vaultId: token.defindexVaultContractAddress ?? '',
    blendPoolId: token.blendPoolContractAddress ?? null,
    usdcId: token.contractAddress?.split(',')?.[0] ?? '',
    decimals: token.decimals ?? 7,
  });

  const total = await prisma.profile.count();

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

  const positions = await getVaquitaPositionsByWalletToken(wallets);

  // De-dupe identical on-chain reads within the batch: two tokens on the same
  // (vault, blend, usdc) contracts read once but still write separate rows.
  const readCache = new Map<string, Promise<{ blendUsdc: number; vaultUsdc: number }>>();

  const results: { wallet: string; tokenId: number; blendUsdc: number; vaultUsdc: number; lastError: string | null }[] = [];
  for (let i = 0; i < wallets.length; i++) {
    const wallet = wallets[i]!;
    for (const token of tokens) {
      const cfg = cfgFor(token);
      const vaquitaPositions = (positions.get(positionKey(wallet, token.id)) ??
        []) as unknown as Prisma.InputJsonValue;
      try {
        const cacheKey = `${wallet}|${cfg.vaultId}|${cfg.blendPoolId}|${cfg.usdcId}`;
        let read = readCache.get(cacheKey);
        if (!read) {
          read = readWithBackoff(wallet, cfg);
          readCache.set(cacheKey, read);
        }
        const { blendUsdc, vaultUsdc } = await read;
        await prisma.walletBalance.upsert({
          where: { walletAddress_tokenId: { walletAddress: wallet, tokenId: token.id } },
          create: { walletAddress: wallet, tokenId: token.id, blendUsdc, vaultUsdc, vaquitaPositions, scrapedAt: new Date() },
          update: { blendUsdc, vaultUsdc, vaquitaPositions, scrapedAt: new Date(), lastError: null },
        });
        results.push({ wallet, tokenId: token.id, blendUsdc, vaultUsdc, lastError: null });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'read failed';
        await prisma.walletBalance.upsert({
          where: { walletAddress_tokenId: { walletAddress: wallet, tokenId: token.id } },
          create: { walletAddress: wallet, tokenId: token.id, blendUsdc: 0, vaultUsdc: 0, vaquitaPositions, scrapedAt: new Date(), lastError: message },
          update: { vaquitaPositions, scrapedAt: new Date(), lastError: message },
        });
        results.push({ wallet, tokenId: token.id, blendUsdc: 0, vaultUsdc: 0, lastError: message });
      }
    }
    if (i < wallets.length - 1) await sleep(SCRAPE_DELAY_MS);
  }

  const nextOffset = useExplicit ? null : offset + limit < total ? offset + limit : null;
  return NextResponse.json({ data: { total, scraped: results.length, nextOffset, results } });
}
