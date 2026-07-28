import { z } from 'zod';
import './env';

// Stellar relayer that submits the permissionless CCTP `mint_and_forward`
// destination transactions. Only the bridge-worker relays, so this group is
// validated lazily (on first access) instead of at module import — the API
// service loads the cctp modules for its bridge routes but never relays, and
// must not be forced to carry the relayer secret. The worker entrypoint calls
// getRelayerEnv() at startup to fail fast.
const relayerEnvSchema = z.object({
  BRIDGE_STELLAR_RELAYER_SECRET: z.string().min(1),
  // Fee bid (stroops, integer) for relayed Stellar transactions.
  BRIDGE_STELLAR_RELAYER_FEE_STROOPS: z.string().regex(/^\d+$/),
  // Timeout (seconds, integer) for relayed Stellar transactions.
  BRIDGE_STELLAR_RELAYER_TIMEOUT_SECONDS: z.string().regex(/^\d+$/).transform(Number),
});

type RelayerEnv = z.infer<typeof relayerEnvSchema>;

let cached: RelayerEnv | null = null;

export function getRelayerEnv(): RelayerEnv {
  if (cached) return cached;

  const parsed = relayerEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌ Invalid environment configuration:');
    console.error(parsed.error.format());
    throw new Error('Invalid environment variables');
  }

  cached = parsed.data;
  return cached;
}
