import { Networks } from '@stellar/stellar-sdk';
import { refreshWalletBalances } from '@vaquita/shared/services/wallets/onchainBalances';
import { NextResponse, type NextRequest } from 'next/server';
import { rpcUrlFor } from '@/lib/contractEvents';
import { adminSecretOk } from '@/lib/adminSecret';

// Throttled batch scrape for the Wallets tab. The work itself lives in
// @vaquita/shared so the scheduled refresh job and this button cannot drift
// apart — this route is only auth, paging bounds and the response shape.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const forbidden = () => NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });

const DEFAULT_BATCH = Number(process.env.SCRAPE_BATCH_SIZE ?? 10);

export async function POST(req: NextRequest) {
  if (!adminSecretOk(req)) return forbidden();

  const body = (await req.json().catch(() => ({}))) as { offset?: number; limit?: number; wallets?: string[] };
  // Capped at 50 here and not in the service: a browser waits on this response,
  // while the scheduled job is free to take a much larger page.
  const limit = Math.max(1, Math.min(50, Number(body.limit ?? DEFAULT_BATCH)));

  try {
    const { total, scraped, nextOffset, results } = await refreshWalletBalances({
      limit,
      offset: Math.max(0, Number(body.offset ?? 0)),
      ...(Array.isArray(body.wallets) && body.wallets.length > 0 ? { wallets: body.wallets } : {}),
      // Admin resolves its own endpoint: the shared default imports the API's
      // env config, which exits the process on a missing var and would take
      // `next build` down with it.
      resolveRpcUrl: (network) => rpcUrlFor(network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET),
    });
    return NextResponse.json({ data: { total, scraped, nextOffset, results } });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Scrape failed';
    const notConfigured = message.includes('No supported token');
    return NextResponse.json({ status: 'error', message }, { status: notConfigured ? 404 : 500 });
  }
}
