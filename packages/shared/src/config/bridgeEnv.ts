import { z } from 'zod';
import './env';

// Circle Iris endpoints (CCTP attestations), one per environment; picked by
// the transfer's source-network environment. Read by both the API service
// (bridge routes refresh attestations) and the bridge-worker.
const bridgeEnvSchema = z.object({
  CIRCLE_CCTP_IRIS_MAINNET_BASE_URL: z.url(),
  CIRCLE_CCTP_IRIS_TESTNET_BASE_URL: z.url(),
});

const parsed = bridgeEnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const bridgeEnv = parsed.data;
