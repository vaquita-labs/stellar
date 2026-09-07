import { Networks, StrKey } from '@stellar/stellar-sdk';
import { Prisma, prisma } from '@vaquita/db';
import { getWalletPositions, type WalletPositionConfig } from '@vaquita/shared/services/stellar/wallet-positions';
import { NextResponse, type NextRequest } from 'next/server';
import { rpcUrlFor } from '@/lib/contractEvents';
import { adminSecretOk } from '@/lib/adminSecret';
import { getVaquitaPositionsByWalletToken, positionKey } from '@vaquita/shared/services/wallets/vaquitaPositions';

// One wallet's on-chain USDC positions across every supported token — a snapshot
// per (wallet, token_id), never mixing token ids. Read-only, admin-gated. Shares
// the read primitive with the batch scrape.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const forbidden = () => NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });
const badRequest = (message: string) => NextResponse.json({ status: 'error', message }, { status: 400 });

const isValidWallet = (a: string) => StrKey.isValidEd25519PublicKey(a) || StrKey.isValidContract(a);

// GET /api/admin/wallets/onchain?wallet=<G…|C…>
export async function GET(req: NextRequest) {
  if (!adminSecretOk(req)) return forbidden();

  const wallet = req.nextUrl.searchParams.get('wallet')?.trim() ?? '';
  if (!wallet || !isValidWallet(wallet)) {
    return badRequest('Valid wallet address (G… or C…) required');
  }

  const tokens = await prisma.token.findMany({ where: { isSupported: true, deletedAt: null } });
  if (!tokens.length) {
    return NextResponse.json({ status: 'error', message: 'No supported token configured' }, { status: 404 });
  }

  const config = await prisma.config.findFirst({ orderBy: { id: 'asc' } });
  const networkPassphrase = config?.networkPassphrase === Networks.PUBLIC ? Networks.PUBLIC : Networks.TESTNET;
  const rpcUrl = rpcUrlFor(config?.networkPassphrase);

  const positions = await getVaquitaPositionsByWalletToken([wallet]);
  const readCache = new Map<string, Promise<{ blendUsdc: number; vaultUsdc: number }>>();

  try {
    const results: { tokenId: number; blendUsdc: number; vaultUsdc: number }[] = [];
    for (const token of tokens) {
      const cfg: WalletPositionConfig = {
        rpcUrl,
        networkPassphrase,
        vaultId: token.defindexVaultContractAddress ?? '',
        blendPoolId: token.blendPoolContractAddress ?? null,
        usdcId: token.contractAddress?.split(',')?.[0] ?? '',
        decimals: token.decimals ?? 7,
      };
      const cacheKey = `${cfg.vaultId}|${cfg.blendPoolId}|${cfg.usdcId}`;
      let read = readCache.get(cacheKey);
      if (!read) {
        read = getWalletPositions(wallet, cfg);
        readCache.set(cacheKey, read);
      }
      const { blendUsdc, vaultUsdc } = await read;
      const vaquitaPositions = (positions.get(positionKey(wallet, token.id)) ??
        []) as unknown as Prisma.InputJsonValue;

      await prisma.walletBalance.upsert({
        where: { walletAddress_tokenId: { walletAddress: wallet, tokenId: token.id } },
        create: { walletAddress: wallet, tokenId: token.id, blendUsdc, vaultUsdc, vaquitaPositions, scrapedAt: new Date() },
        update: { blendUsdc, vaultUsdc, vaquitaPositions, scrapedAt: new Date(), lastError: null },
      });
      results.push({ tokenId: token.id, blendUsdc, vaultUsdc });
    }

    return NextResponse.json({
      data: { wallet, network: networkPassphrase === Networks.PUBLIC ? 'mainnet' : 'testnet', results },
    });
  } catch (error) {
    console.error('[wallets/onchain] read failed', error);
    const message = error instanceof Error ? error.message : 'On-chain read failed';
    return NextResponse.json({ status: 'error', message }, { status: 502 });
  }
}
