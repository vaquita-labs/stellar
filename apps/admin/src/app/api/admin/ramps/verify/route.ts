import { Networks } from '@stellar/stellar-sdk';
import { prisma } from '@vaquita/db';
import { NextResponse, type NextRequest } from 'next/server';
import { adminSecretOk } from '@/lib/adminSecret';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Horizon rather than Soroban RPC: the RPC only keeps about a week of
// transactions, and the rows worth checking here are usually older than that.
const horizonUrlFor = (networkPassphrase: string | null | undefined) =>
  networkPassphrase === Networks.PUBLIC ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org';

const HASH = /^[0-9a-f]{64}$/i;

interface HorizonTransfer {
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
  from?: string;
  to?: string;
  amount?: string;
}

interface HorizonOperation extends HorizonTransfer {
  type: string;
  // Soroban invocations report token moves here instead of top-level fields.
  asset_balance_changes?: (HorizonTransfer & { type?: string })[];
}

export interface VerifiedTransfer {
  from: string | null;
  to: string | null;
  asset: string;
  amount: string;
}

const assetLabel = (t: HorizonTransfer) => (t.asset_type === 'native' ? 'XLM' : (t.asset_code ?? '?'));

/**
 * Looks a hash up on the ledger and lists the token movements it made. A hash
 * stored on a ramp row is only what the client reported: a transaction that was
 * built but never submitted, or submitted and failed, still has one.
 */
export async function GET(req: NextRequest) {
  if (!adminSecretOk(req)) {
    return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });
  }

  const hash = req.nextUrl.searchParams.get('hash')?.trim() ?? '';
  if (!HASH.test(hash)) {
    return NextResponse.json({ status: 'error', message: 'Invalid transaction hash' }, { status: 400 });
  }

  const config = await prisma.config.findFirst({ orderBy: { id: 'asc' } });
  const horizon = horizonUrlFor(config?.networkPassphrase);

  try {
    const txRes = await fetch(`${horizon}/transactions/${hash}`, { cache: 'no-store' });
    if (txRes.status === 404) {
      return NextResponse.json({ data: { hash, found: false } });
    }
    if (!txRes.ok) throw new Error(`Horizon answered ${txRes.status}`);
    const tx = (await txRes.json()) as { successful?: boolean; created_at?: string; ledger?: number };

    const opsRes = await fetch(`${horizon}/transactions/${hash}/operations?limit=50`, { cache: 'no-store' });
    const ops = opsRes.ok
      ? (((await opsRes.json()) as { _embedded?: { records?: HorizonOperation[] } })._embedded?.records ?? [])
      : [];

    const transfers: VerifiedTransfer[] = ops.flatMap((op) => {
      if (op.asset_balance_changes?.length) {
        return op.asset_balance_changes.map((c) => ({
          from: c.from ?? null,
          to: c.to ?? null,
          asset: assetLabel(c),
          amount: c.amount ?? '0',
        }));
      }
      if (op.amount != null) {
        return [{ from: op.from ?? null, to: op.to ?? null, asset: assetLabel(op), amount: op.amount }];
      }
      return [];
    });

    return NextResponse.json({
      data: {
        hash,
        found: true,
        // Included in a ledger but failed: it moved nothing.
        successful: tx.successful !== false,
        createdAt: tx.created_at ?? null,
        ledger: tx.ledger ?? null,
        transfers,
      },
    });
  } catch (error) {
    console.error('[ramps/verify] Horizon lookup failed', error);
    const message = error instanceof Error ? error.message : 'Horizon lookup failed';
    return NextResponse.json({ status: 'error', message }, { status: 502 });
  }
}
