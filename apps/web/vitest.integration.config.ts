import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Testnet integration suite: `src/**/__integration__/*.integration.ts`, kept out
// of the default `vitest run` by filename. Runs against the real Soroban testnet
// RPC and signs with INTEGRATION_STELLAR_SECRET; every test skips itself when
// that key is absent, so the suite is green offline too.
//
// The client env mirrors vitest.config.ts except the testnet RPC, which must be
// reachable: app modules (`poolQueries`, `txCredit`) read it through `clientEnv`.
// The Pollar key only decides the network by its prefix and is never sent.
const integrationEnv = {
  NEXT_PUBLIC_SERVICES_URL: 'https://services.test',
  NEXT_PUBLIC_STELLAR_MAINNET_SOROBAN_RPC_URL: 'https://mainnet.sorobanrpc.test',
  NEXT_PUBLIC_STELLAR_TESTNET_SOROBAN_RPC_URL:
    process.env.NEXT_PUBLIC_STELLAR_TESTNET_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org',
  NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY: 'pub_testnet_integration',
  NEXT_PUBLIC_BLEND_FEE_STROOPS: '1000000',
  NEXT_PUBLIC_CARD_VERSION: 'test',
  NEXT_PUBLIC_QUERY_CACHE_VERSION: 'test',
};

// CI points this at a file to publish a JUnit report; locally the console is enough.
const junitFile = process.env.INTEGRATION_JUNIT_FILE;

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/__integration__/*.integration.ts'],
    env: integrationEnv,
    // One transaction chain at a time: the tests share a single funded account
    // whose sequence number must advance in order.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 120_000,
    hookTimeout: 120_000,
    reporters: junitFile ? ['default', 'junit'] : ['default'],
    outputFile: junitFile ? { junit: junitFile } : undefined,
  },
});
