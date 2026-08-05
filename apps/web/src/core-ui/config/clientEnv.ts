import { z } from 'zod';

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
  // Fee bid (stroops) for direct-to-Blend transactions.
  NEXT_PUBLIC_BLEND_FEE_STROOPS: z.string().regex(/^\d+$/, 'must be an integer (stroops)'),
  // Share-card cache-buster. Stamped by next.config.ts on every build — never
  // set by hand.
  NEXT_PUBLIC_CARD_VERSION: z.string().min(1),
  // Buster for the react-query cache persisted in localStorage. Any value
  // change discards every persisted entry on the next load, so a release that
  // reads a new field off a cached payload is not served stale objects that
  // predate it.
  NEXT_PUBLIC_QUERY_CACHE_VERSION: z.string().min(1),
  // Rollout flag for passive deposits via the DeFindex vault. OPTIONAL and
  // dark-by-default: unset/anything-but-"true" means off, so the vault path
  // ships invisibly until this is explicitly set to "true". See featureFlags.ts.
  NEXT_PUBLIC_PASSIVE_VAULT_ENABLED: z.string().optional(),
  // Flag for the "install the app" step shown to mobile users on the login
  // screen (after the intro, before authenticating). OPTIONAL and
  // off-by-default: unset/anything-but-"true" means the step never appears.
  // See featureFlags.ts.
  NEXT_PUBLIC_INSTALL_PROMPT_ENABLED: z.string().optional(),
});

// Literal process.env.* references: Next.js only injects NEXT_PUBLIC_ values
// into the client bundle when they appear written out in full.
const parsed = envClientSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_SERVICES_URL: process.env.NEXT_PUBLIC_SERVICES_URL,
  NEXT_PUBLIC_STELLAR_MAINNET_SOROBAN_RPC_URL: process.env.NEXT_PUBLIC_STELLAR_MAINNET_SOROBAN_RPC_URL,
  NEXT_PUBLIC_STELLAR_TESTNET_SOROBAN_RPC_URL: process.env.NEXT_PUBLIC_STELLAR_TESTNET_SOROBAN_RPC_URL,
  NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY,
  NEXT_PUBLIC_BLEND_FEE_STROOPS: process.env.NEXT_PUBLIC_BLEND_FEE_STROOPS,
  NEXT_PUBLIC_CARD_VERSION: process.env.NEXT_PUBLIC_CARD_VERSION,
  NEXT_PUBLIC_QUERY_CACHE_VERSION: process.env.NEXT_PUBLIC_QUERY_CACHE_VERSION,
  NEXT_PUBLIC_PASSIVE_VAULT_ENABLED: process.env.NEXT_PUBLIC_PASSIVE_VAULT_ENABLED,
  NEXT_PUBLIC_INSTALL_PROMPT_ENABLED: process.env.NEXT_PUBLIC_INSTALL_PROMPT_ENABLED,
});

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(parsed.error.format());
  throw new Error('Invalid environment variables');
}

export const clientEnv = parsed.data;
