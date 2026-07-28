import { z } from 'zod';

const StellarContractId = z
  .string()
  .regex(/^C[A-Z2-7]{55}$/, 'must be a C… Soroban contract address');
const StellarAccountId = z
  .string()
  .regex(/^G[A-Z2-7]{55}$/, 'must be a G… Stellar account address');

// TODAS las envs del cliente pasan por acá: el código nunca lee process.env
// directamente, siempre `clientEnv`. Todas son requeridas — si falta una, el
// build/arranque falla acá en vez de degradar en silencio en runtime.
const envClientSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  // Base URL of the API service the web client calls.
  NEXT_PUBLIC_SERVICES_URL: z.url(),
  // Soroban RPC endpoints, one per network. The active one is picked by the
  // network derived from the Pollar key, so a mainnet wallet can never hit a
  // testnet RPC (or vice versa).
  NEXT_PUBLIC_STELLAR_MAINNET_SOROBAN_RPC_URL: z.url(),
  NEXT_PUBLIC_STELLAR_TESTNET_SOROBAN_RPC_URL: z.url(),
  // Pollar publishable key. Su prefijo decide la red Stellar ACTIVA de toda la
  // app (pub_mainnet_… → mainnet, pub_testnet_… → testnet), así que un valor
  // vacío o malformado significaría "testnet silencioso" — por eso el regex.
  NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY: z
    .string()
    .regex(/^pub_(mainnet|testnet)_/, 'must start with pub_mainnet_ or pub_testnet_'),
  // Blend V2: pool, USDC (reserva) que ese pool acepta y su emisor, para la red
  // ACTIVA. El emisor distingue el USDC de Blend de otros "USDC" de emisores
  // distintos (relevante en testnet; en mainnet hay uno solo).
  NEXT_PUBLIC_BLEND_POOL_CONTRACT_ID: StellarContractId,
  NEXT_PUBLIC_BLEND_USDC_CONTRACT_ID: StellarContractId,
  NEXT_PUBLIC_BLEND_USDC_ISSUER: StellarAccountId,
  // Fee bid (stroops) para las tx de Blend.
  NEXT_PUBLIC_BLEND_FEE_STROOPS: z.string().regex(/^\d+$/, 'must be an integer (stroops)'),
  // Cache-buster de las share cards. La estampa next.config.ts en cada build —
  // NUNCA setearla a mano.
  NEXT_PUBLIC_CARD_VERSION: z.string().min(1),
});

// Referencias literales a process.env.*: Next.js inyecta las NEXT_PUBLIC_ en el
// bundle del cliente solo cuando aparecen escritas completas.
const parsed = envClientSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_SERVICES_URL: process.env.NEXT_PUBLIC_SERVICES_URL,
  NEXT_PUBLIC_STELLAR_MAINNET_SOROBAN_RPC_URL: process.env.NEXT_PUBLIC_STELLAR_MAINNET_SOROBAN_RPC_URL,
  NEXT_PUBLIC_STELLAR_TESTNET_SOROBAN_RPC_URL: process.env.NEXT_PUBLIC_STELLAR_TESTNET_SOROBAN_RPC_URL,
  NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY,
  NEXT_PUBLIC_BLEND_POOL_CONTRACT_ID: process.env.NEXT_PUBLIC_BLEND_POOL_CONTRACT_ID,
  NEXT_PUBLIC_BLEND_USDC_CONTRACT_ID: process.env.NEXT_PUBLIC_BLEND_USDC_CONTRACT_ID,
  NEXT_PUBLIC_BLEND_USDC_ISSUER: process.env.NEXT_PUBLIC_BLEND_USDC_ISSUER,
  NEXT_PUBLIC_BLEND_FEE_STROOPS: process.env.NEXT_PUBLIC_BLEND_FEE_STROOPS,
  NEXT_PUBLIC_CARD_VERSION: process.env.NEXT_PUBLIC_CARD_VERSION,
});

if (!parsed.success) {
  console.error('❌ Error en configuración de variables de entorno:');
  console.error(parsed.error.format());
  throw new Error('Variables de entorno inválidas');
}

export const clientEnv = parsed.data;
