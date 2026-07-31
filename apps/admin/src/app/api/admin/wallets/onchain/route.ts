import { Networks, StrKey } from '@stellar/stellar-sdk';
import { prisma } from '@vaquita/db';
import { getWalletPositions } from '@vaquita/shared/services/stellar/wallet-positions';
import { NextResponse, type NextRequest } from 'next/server';
import { rpcUrlFor } from '@/lib/contractEvents';
import { adminSecretOk } from '@/lib/adminSecret';

// One wallet's on-chain USDC positions: how much it holds in the DeFindex vault
// (new passive) and directly in Blend (legacy). Read-only, admin-gated. This is
// the primitive the batch scrape and search box both call.
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

  // The passive/vault token = the supported token wired to a DeFindex vault;
  // fall back to USDC by symbol.
  const token =
    (await prisma.token.findFirst({ where: { defindexVaultContractAddress: { not: null }, deletedAt: null } })) ??
    (await prisma.token.findFirst({ where: { symbol: 'USDC', deletedAt: null } }));
  if (!token) {
    return NextResponse.json({ status: 'error', message: 'No USDC/vault token configured' }, { status: 404 });
  }

  const config = await prisma.config.findFirst({ orderBy: { id: 'asc' } });
  const networkPassphrase = config?.networkPassphrase === Networks.PUBLIC ? Networks.PUBLIC : Networks.TESTNET;
  const rpcUrl = rpcUrlFor(config?.networkPassphrase);

  try {
    const { blendUsdc, vaultUsdc } = await getWalletPositions(wallet, {
      rpcUrl,
      networkPassphrase,
      vaultId: token.defindexVaultContractAddress ?? '',
      blendPoolId: token.blendPoolContractAddress ?? null,
      usdcId: token.contractAddress?.split(',')?.[0] ?? '',
      decimals: token.decimals ?? 7,
    });
    return NextResponse.json({
      data: {
        wallet,
        network: networkPassphrase === Networks.PUBLIC ? 'mainnet' : 'testnet',
        blendUsdc,
        vaultUsdc,
        total: blendUsdc + vaultUsdc,
      },
    });
  } catch (error) {
    console.error('[wallets/onchain] read failed', error);
    const message = error instanceof Error ? error.message : 'On-chain read failed';
    return NextResponse.json({ status: 'error', message }, { status: 502 });
  }
}
