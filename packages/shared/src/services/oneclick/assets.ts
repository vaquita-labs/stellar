/**
 * The asset ids 1Click routes between, and the chains we expose.
 *
 * These strings are 1Click's own identifiers, not ours: `nep141:` for a token
 * bridged into NEAR from an EVM chain, `nep245:` for a multi-token contract
 * (which is how the Stellar assets are represented). They are opaque — do not
 * try to parse a chain or a contract address out of them, look them up here.
 *
 * Testnet is deliberately absent. 1Click has no testnet deployment, so the
 * bridge is a mainnet-only feature; the API refuses a quote rather than
 * pretending otherwise on a testnet deploy.
 */

export type BridgeChain = 'base' | 'stellar';

export type BridgeAsset = {
  /** 1Click asset id, sent verbatim as originAsset / destinationAsset. */
  assetId: string;
  chain: BridgeChain;
  symbol: 'USDC';
  decimals: number;
};

export const BASE_USDC: BridgeAsset = {
  assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near',
  chain: 'base',
  symbol: 'USDC',
  decimals: 6,
};

export const STELLAR_USDC: BridgeAsset = {
  assetId: 'nep245:v2_1.omni.hot.tg:1100_111bzQBB65GxAPAVoxqmMcgYo5oS3txhqs1Uh1cgahKQUeTUq1TJu',
  chain: 'stellar',
  symbol: 'USDC',
  decimals: 7,
};

/** 'evm_to_stellar' brings USDC in from Base; 'stellar_to_evm' sends it out. */
export type BridgeDirection = 'evm_to_stellar' | 'stellar_to_evm';

export const BRIDGE_DIRECTIONS: readonly BridgeDirection[] = ['evm_to_stellar', 'stellar_to_evm'];

export const isBridgeDirection = (value: unknown): value is BridgeDirection =>
  typeof value === 'string' && (BRIDGE_DIRECTIONS as readonly string[]).includes(value);

export const assetsForDirection = (
  direction: BridgeDirection,
): { origin: BridgeAsset; destination: BridgeAsset } =>
  direction === 'evm_to_stellar'
    ? { origin: BASE_USDC, destination: STELLAR_USDC }
    : { origin: STELLAR_USDC, destination: BASE_USDC };

/**
 * Human USDC ("12.5") to the base-unit integer string 1Click expects.
 *
 * Decimals differ per side — Base USDC has 6, Stellar USDC has 7 — so the
 * origin asset picks the scale, and passing the wrong one is off by 10x rather
 * than an error. Extra fractional digits are TRUNCATED, never rounded up: a
 * quote for more than the user typed would fail at deposit time.
 */
export const humanToBaseUnits = (human: string, decimals: number): string | null => {
  const trimmed = human.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const [whole, frac = ''] = trimmed.split('.');
  const scaled = `${whole}${frac.slice(0, decimals).padEnd(decimals, '0')}`.replace(/^0+(?=\d)/, '');
  return scaled === '' ? '0' : scaled;
};
