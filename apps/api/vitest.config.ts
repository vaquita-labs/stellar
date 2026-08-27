import { defineConfig } from 'vitest/config';

// Dummy values for the required schemas (shared config/env + the API's
// config/env): unit tests import modules that validate the env at load time
// but never touch real external services.
const testEnv = {
  PORT: '3100',
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  STELLAR_MAINNET_SOROBAN_RPC_URL: 'https://mainnet.sorobanrpc.test',
  STELLAR_TESTNET_SOROBAN_RPC_URL: 'https://testnet.sorobanrpc.test',
  STELLAR_NETWORK: 'testnet',
  ABLY_KEY: 'test.key:secret',
  BADGE_SIGNING_SEED: '0'.repeat(64),
  MAINNET_LAUNCH_TIMESTAMP: '1750000000000',
  DEFINDEX_API_HOST: 'https://defindex.test',
  DEFINDEX_API_KEY: 'test-key',
  CIRCLE_CCTP_IRIS_MAINNET_BASE_URL: 'https://iris-api.circle.com',
  CIRCLE_CCTP_IRIS_TESTNET_BASE_URL: 'https://iris-api-sandbox.circle.com',
  BRIDGE_STELLAR_RELAYER_SECRET: 'SB3KFXCTPHLDN37QMXNPPYYXOF5V4XCUAYVLF2YWYRXHJIGL2XOZQUAI',
  BRIDGE_STELLAR_RELAYER_FEE_STROOPS: '1000000',
  BRIDGE_STELLAR_RELAYER_TIMEOUT_SECONDS: '60',
  AUTH_SESSION_SECRET: 'test-session-secret-0123456789abcdef',
  AUTH_HOME_DOMAIN: 'vaquita.app',
  WALLET_AUTH_ENFORCE: 'true',
  ADMIN_SECRET: 'test-admin-secret-0123456789abcdef',
  LOG_LEVEL: 'error',
  OBSERVABILITY_METRICS_ENABLED: 'false',
  OBSERVABILITY_METRICS_REFRESH_MS: '60000',
};

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: testEnv,
  },
});
