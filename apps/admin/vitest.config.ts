import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Dummy values for the server env schema: the auth libraries validate it on
// first access but never reach a real service in unit tests.
const testEnv = {
  NODE_ENV: 'test' as const,
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  STELLAR_MAINNET_SOROBAN_RPC_URL: 'https://mainnet.sorobanrpc.test',
  STELLAR_TESTNET_SOROBAN_RPC_URL: 'https://testnet.sorobanrpc.test',
  NEXT_PUBLIC_SERVICES_URL: 'https://api.example.invalid',
  ADMIN_SECRET: 'test-admin-secret-0123456789abcdef',
  ADMIN_PASSCODE: 'test-passcode-01',
};

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: testEnv,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
