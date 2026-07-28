// MUST be first: loads .env.local/.env into process.env before @vaquita/db is
// evaluated (it builds the Prisma adapter from DATABASE_URL at import time).
import './loadEnv';
import { z } from 'zod';
import { prisma } from '@vaquita/db';
import { getRelayerEnv } from '@vaquita/shared/config/relayerEnv';
import {
  prismaBridgeConfirmationQueue,
  runBridgeConfirmationBatch,
} from '@vaquita/shared/services/cctp/worker';

// Worker-only env, all required and validated at startup (the base and bridge
// groups are validated by the @vaquita/shared schemas the imports load).
const positiveInt = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .refine((n) => Number.isSafeInteger(n) && n > 0, 'must be a positive integer');

const workerEnvSchema = z.object({
  // 'true' runs a single batch and exits (same as --once); 'false' loops.
  BRIDGE_CONFIRMATION_ONCE: z.enum(['true', 'false']),
  BRIDGE_CONFIRMATION_INTERVAL_MS: positiveInt,
  BRIDGE_CONFIRMATION_BATCH_SIZE: positiveInt,
  BRIDGE_CONFIRMATION_LEASE_MS: positiveInt,
  BRIDGE_CONFIRMATION_STALE_AFTER_MS: positiveInt,
});

const parsedWorkerEnv = workerEnvSchema.safeParse(process.env);
if (!parsedWorkerEnv.success) {
  console.error('❌ Invalid environment configuration for the bridge worker:');
  console.error(parsedWorkerEnv.error.format());
  process.exit(1);
}
const workerEnv = parsedWorkerEnv.data;

// The relayer group is lazy in @vaquita/shared (the API loads the cctp modules
// without it); resolve it here so a misconfigured worker fails at startup, not
// on the first relayed transfer.
getRelayerEnv();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const once = process.argv.includes('--once') || workerEnv.BRIDGE_CONFIRMATION_ONCE === 'true';
const intervalMs = workerEnv.BRIDGE_CONFIRMATION_INTERVAL_MS;
const batchSize = workerEnv.BRIDGE_CONFIRMATION_BATCH_SIZE;
const leaseMs = workerEnv.BRIDGE_CONFIRMATION_LEASE_MS;
const staleAfterMs = workerEnv.BRIDGE_CONFIRMATION_STALE_AFTER_MS;

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
