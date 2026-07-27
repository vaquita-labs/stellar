import { z } from 'zod';

const envClientSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  NEXT_PUBLIC_SERVICES_URL: z.string().min(1),
  // Soroban RPC endpoints, one per network. Both are always required so that
  // switching networks (derived from the Pollar key) can never silently point
  // the app at an RPC of the wrong network.
  NEXT_PUBLIC_STELLAR_MAINNET_SOROBAN_RPC_URL: z.url(),
  NEXT_PUBLIC_STELLAR_TESTNET_SOROBAN_RPC_URL: z.url(),
});

const parsed = envClientSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_SERVICES_URL: process.env.NEXT_PUBLIC_SERVICES_URL,
  NEXT_PUBLIC_STELLAR_MAINNET_SOROBAN_RPC_URL: process.env.NEXT_PUBLIC_STELLAR_MAINNET_SOROBAN_RPC_URL,
  NEXT_PUBLIC_STELLAR_TESTNET_SOROBAN_RPC_URL: process.env.NEXT_PUBLIC_STELLAR_TESTNET_SOROBAN_RPC_URL,
});

if (!parsed.success) {
  console.error('❌ Error en configuración de variables de entorno:');
  console.error(parsed.error.format());
  throw new Error('Variables de entorno inválidas');
}

export const clientEnv = parsed.data;
