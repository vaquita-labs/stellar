import 'dotenv/config';
import { prisma } from '@vaquita/db';
import {
  prismaBridgeConfirmationQueue,
  runBridgeConfirmationBatch,
} from '@vaquita/shared/services/cctp/index';

const readPositiveInteger = (name: string, fallback: number): number => {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const once = process.argv.includes('--once') || process.env.BRIDGE_CONFIRMATION_ONCE === 'true';
const intervalMs = readPositiveInteger('BRIDGE_CONFIRMATION_INTERVAL_MS', 60_000);
const batchSize = readPositiveInteger('BRIDGE_CONFIRMATION_BATCH_SIZE', 20);
const leaseMs = readPositiveInteger('BRIDGE_CONFIRMATION_LEASE_MS', 60_000);
const staleAfterMs = readPositiveInteger('BRIDGE_CONFIRMATION_STALE_AFTER_MS', 24 * 60 * 60 * 1000);

let stopping = false;
process.on('SIGTERM', () => {
  stopping = true;
});
process.on('SIGINT', () => {
  stopping = true;
});

const runOnce = async () => {
  const result = await runBridgeConfirmationBatch({
    queue: {
      claimPending: (limit) => prismaBridgeConfirmationQueue.claimPending(limit, leaseMs),
      save: prismaBridgeConfirmationQueue.save,
    },
    batchSize,
    staleAfterMs,
  });
  console.info('[bridge-confirmation] batch complete', result);
};

try {
  do {
    await runOnce();
    if (!once && !stopping) await sleep(intervalMs);
  } while (!once && !stopping);
} catch (error) {
  console.error('[bridge-confirmation] failed', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
  if (once) process.exit(process.exitCode ?? 0);
}
