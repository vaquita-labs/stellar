import { StrKey } from '@stellar/stellar-sdk';
import { prisma } from '@vaquita/db';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { defaultRpcUrlFor, formatUnits, scanPoolEvents, type ParsedPoolEvent } from '@/lib/contractEvents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Mirrors the guard in /api/admin/tokens: open when ADMIN_SECRET is unset,
// otherwise require the matching x-admin-secret header.
function adminSecretOk(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return true;
  return req.headers.get('x-admin-secret') === secret;
}

const forbidden = () => NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });

// Accepts either an ISO datetime or a plain YYYY-MM-DD date.
const dateInput = z
  .string()
  .min(1)
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Invalid date' });

const bodySchema = z.object({
  from: dateInput,
  to: dateInput,
  // Optional override; by default we scan the pool addresses configured on tokens.
  contractAddress: z.string().min(1).optional(),
});

const isDateOnly = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Inclusive day bounds in UTC for date-only inputs, raw parse otherwise. */
const toRangeMs = (value: string, edge: 'start' | 'end'): number => {
  if (isDateOnly(value)) {
    return edge === 'start' ? Date.parse(`${value}T00:00:00.000Z`) : Date.parse(`${value}T23:59:59.999Z`);
  }
  return Date.parse(value);
};

export async function POST(req: NextRequest) {
  if (!adminSecretOk(req)) return forbidden();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ status: 'error', message: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { status: 'error', message: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const fromMs = toRangeMs(parsed.data.from, 'start');
  const toMs = toRangeMs(parsed.data.to, 'end');
  if (fromMs > toMs) {
    return NextResponse.json({ status: 'error', message: '"from" must be before "to"' }, { status: 400 });
  }

  // Pull tokens once: gives us pool addresses to scan plus decimals/symbol for
  // formatting amounts, keyed by lower-cased contract address.
  const tokens = await prisma.token.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      symbol: true,
      decimals: true,
      contractAddress: true,
      vaquitaContractAddress: true,
    },
  });

  const requestedIds = parsed.data.contractAddress
    ? [parsed.data.contractAddress]
    : Array.from(new Set(tokens.map((t) => t.vaquitaContractAddress).filter((a): a is string => !!a)));

  if (requestedIds.length === 0) {
    return NextResponse.json(
      {
        status: 'error',
        message:
          'No pool contract address configured. Set "vaquitaContractAddress" on a token (Admin → Tokens) or pass contractAddress.',
      },
      { status: 400 }
    );
  }

  // Drop malformed addresses (e.g. test/placeholder values) — the RPC rejects
  // the whole filter if a single contract ID is invalid.
  const setupWarnings: string[] = [];
  let contractIds = requestedIds.filter((id) => StrKey.isValidContract(id));
  const invalidIds = requestedIds.filter((id) => !StrKey.isValidContract(id));
  if (invalidIds.length) {
    setupWarnings.push(`Skipped ${invalidIds.length} invalid contract address(es): ${invalidIds.join(', ')}.`);
  }

  if (contractIds.length === 0) {
    return NextResponse.json(
      {
        status: 'error',
        message: `No valid pool contract address to scan. Invalid: ${invalidIds.join(', ') || '(none)'}.`,
      },
      { status: 400 }
    );
  }
  if (contractIds.length > 5) {
    // RPC caps contractIds at 5 per filter.
    contractIds = contractIds.slice(0, 5);
  }

  const config = await prisma.config.findFirst({ orderBy: { id: 'asc' } });
  const rpcUrl = process.env.SOROBAN_RPC_URL || defaultRpcUrlFor(config?.networkPassphrase);

  let scan;
  try {
    scan = await scanPoolEvents({ rpcUrl, contractIds, fromMs, toMs });
  } catch (error) {
    console.error('[contract-events] scan failed', error);
    const message = error instanceof Error ? error.message : 'Failed to read events from the RPC';
    return NextResponse.json({ status: 'error', message }, { status: 502 });
  }

  // Token lookup by pool address (to resolve decimals/symbol for each event).
  const tokenByPool = new Map<string, (typeof tokens)[number]>();
  for (const t of tokens) {
    if (t.vaquitaContractAddress) tokenByPool.set(t.vaquitaContractAddress.toLowerCase(), t);
  }
  const tokenByContract = new Map<string, (typeof tokens)[number]>();
  for (const t of tokens) {
    if (t.contractAddress) tokenByContract.set(t.contractAddress.toLowerCase(), t);
  }

  const isDepositOrWithdraw = (e: ParsedPoolEvent) => e.type === 'deposit' || e.type === 'withdraw';

  // Cross-reference the DB so the admin can see which deposits/withdrawals are
  // already populated (only meaningful for those event types).
  const depositIds = Array.from(
    new Set(scan.events.filter((e) => e.type === 'deposit').map((e) => e.depositId).filter(Boolean))
  );
  const txHashes = Array.from(
    new Set(scan.events.filter((e) => e.type === 'withdraw').map((e) => e.txHash).filter(Boolean))
  );

  const [existingDeposits, existingWithdrawals] = await Promise.all([
    depositIds.length
      ? prisma.deposit.findMany({
          where: { depositIdHex: { in: depositIds } },
          select: { depositIdHex: true },
        })
      : Promise.resolve([]),
    txHashes.length
      ? prisma.withdrawal.findMany({
          where: { transactionHash: { in: txHashes } },
          select: { transactionHash: true },
        })
      : Promise.resolve([]),
  ]);

  const knownDepositIds = new Set(existingDeposits.map((d) => d.depositIdHex).filter(Boolean));
  const knownWithdrawalHashes = new Set(existingWithdrawals.map((w) => w.transactionHash).filter(Boolean));

  const inDb = (e: ParsedPoolEvent): string => {
    if (!isDepositOrWithdraw(e)) return '';
    const known = e.type === 'deposit' ? knownDepositIds.has(e.depositId) : knownWithdrawalHashes.has(e.txHash);
    return known ? 'yes' : 'no';
  };

  const rows = scan.events
    .map((e) => {
      const token = tokenByPool.get(e.contractId.toLowerCase()) ?? tokenByContract.get(e.tokenAddress.toLowerCase());
      const decimals = token?.decimals ?? null;
      return {
        type: e.type,
        ledgerClosedAt: e.ledgerClosedAt,
        ledger: e.ledger,
        depositId: e.depositId,
        wallet: e.caller,
        token: e.tokenAddress ? (token?.symbol ?? e.tokenAddress) : '',
        amount: e.amount ? formatUnits(e.amount, decimals) : '',
        amountRaw: e.amount,
        shares: e.shares,
        reward: e.reward ? formatUnits(e.reward, decimals) : '',
        details: e.details,
        contractId: e.contractId,
        txHash: e.txHash,
        inDb: inDb(e),
      };
    })
    // Most recent first.
    .sort((a, b) => Date.parse(b.ledgerClosedAt) - Date.parse(a.ledgerClosedAt));

  // Count of each event type, e.g. { deposit: 2, withdraw: 2, lp_add: 2, … }.
  const byType: Record<string, number> = {};
  for (const r of rows) byType[r.type] = (byType[r.type] ?? 0) + 1;

  return NextResponse.json({
    data: {
      rows,
      summary: {
        total: rows.length,
        deposits: byType.deposit ?? 0,
        withdrawals: byType.withdraw ?? 0,
        missingInDb: rows.filter((r) => r.inDb === 'no').length,
        scanned: scan.scanned,
        byType,
        contractIds,
        rpcUrl,
        ledgerRange: scan.ledgerRange,
        retention: scan.retention,
        truncated: scan.truncated,
        warnings: [...setupWarnings, ...scan.warnings],
      },
    },
  });
}
