import { z } from 'zod';

const StellarContractId = z
  .string()
  .regex(/^C[A-Z2-7]{55}$/, 'must be a C… Soroban contract address');
const StellarAccountId = z
  .string()
  .regex(/^G[A-Z2-7]{55}$/, 'must be a G… Stellar account address');

// Every client env goes through here: code never reads process.env directly,
// always `clientEnv`. All are required — a missing one fails the build/boot
// here instead of degrading silently at runtime.
const envClientSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  // Base URL of the API service the web client calls.
  NEXT_PUBLIC_SERVICES_URL: z.url(),
  // Soroban RPC endpoints, one per network. The active one is picked by the
  // network derived from the Pollar key, so a mainnet wallet can never hit a
  // testnet RPC (or vice versa).
  NEXT_PUBLIC_STELLAR_MAINNET_SOROBAN_RPC_URL: z.url(),
  NEXT_PUBLIC_STELLAR_TESTNET_SOROBAN_RPC_URL: z.url(),
  // Pollar publishable key. Its prefix selects the ACTIVE Stellar network of
  // the whole app (pub_mainnet_… → mainnet, pub_testnet_… → testnet), so an
  // empty or malformed value would mean "silent testnet" — hence the regex.
  NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY: z
    .string()
    .regex(/^pub_(mainnet|testnet)_/, 'must start with pub_mainnet_ or pub_testnet_'),
  // Blend V2: pool, the USDC reserve that pool accepts, and its issuer, for
  // the ACTIVE network. The issuer tells Blend's USDC apart from other "USDC"
  // assets from different issuers (relevant on testnet; mainnet has one only).
  NEXT_PUBLIC_BLEND_POOL_CONTRACT_ID: StellarContractId,
  NEXT_PUBLIC_BLEND_USDC_CONTRACT_ID: StellarContractId,
  NEXT_PUBLIC_BLEND_USDC_ISSUER: StellarAccountId,
  // Fee bid (stroops) for Blend transactions.
  NEXT_PUBLIC_BLEND_FEE_STROOPS: z.string().regex(/^\d+$/, 'must be an integer (stroops)'),
  // Share-card cache-buster. Stamped by next.config.ts on every build — never
  // set by hand.
  NEXT_PUBLIC_CARD_VERSION: z.string().min(1),
});

// Literal process.env.* references: Next.js only injects NEXT_PUBLIC_ values
// into the client bundle when they appear written out in full.
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
