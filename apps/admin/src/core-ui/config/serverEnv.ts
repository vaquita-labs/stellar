import { z } from 'zod';

// SERVER-ONLY env (no NEXT_PUBLIC_ prefix): never import from client components.
const envServerSchema = z.object({
  // Soroban RPC endpoints, one per network. Both are always required; the
  // contract-events scan picks one by the Config network passphrase, so neither
  // can silently fall back to a public endpoint of the wrong network.
  STELLAR_MAINNET_SOROBAN_RPC_URL: z.url(),
  STELLAR_TESTNET_SOROBAN_RPC_URL: z.url(),
});

const parsed = envServerSchema.safeParse({
  STELLAR_MAINNET_SOROBAN_RPC_URL: process.env.STELLAR_MAINNET_SOROBAN_RPC_URL,
  STELLAR_TESTNET_SOROBAN_RPC_URL: process.env.STELLAR_TESTNET_SOROBAN_RPC_URL,
});

if (!parsed.success) {
  console.error('❌ Error en configuración de variables de entorno:');
  console.error(parsed.error.format());
  throw new Error('Variables de entorno inválidas');
}

export const serverEnv = parsed.data;
