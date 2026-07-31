import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Dummy client env for unit tests: importing app modules pulls in `clientEnv`,
// which validates NEXT_PUBLIC_* at load time (see core-ui/config/clientEnv.ts).
// Tests never touch real RPC/services — these just satisfy the schema so imports
// don't throw. The passive-vault and install-prompt flags are intentionally left
// UNSET so the default (dark/off) is what tests observe.
// NODE_ENV is set to 'test' by vitest itself, so it's omitted here (typing it in
// this object would clash with ProcessEnv's narrow NODE_ENV union).
const testEnv = {
  NEXT_PUBLIC_SERVICES_URL: 'https://services.test',
  NEXT_PUBLIC_STELLAR_MAINNET_SOROBAN_RPC_URL: 'https://mainnet.sorobanrpc.test',
  NEXT_PUBLIC_STELLAR_TESTNET_SOROBAN_RPC_URL: 'https://testnet.sorobanrpc.test',
  NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY: 'pub_testnet_test',
  NEXT_PUBLIC_BLEND_FEE_STROOPS: '1000000',
  NEXT_PUBLIC_CARD_VERSION: 'test',
  NEXT_PUBLIC_QUERY_CACHE_VERSION: 'test',
};

export default defineConfig({
  // Mirror the tsconfig path alias (@/* → src/*) so imports resolve under vitest.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    env: testEnv,
  },
});
