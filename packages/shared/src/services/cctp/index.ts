import { StrKey } from '@stellar/stellar-sdk';
export * from './attestation';
export * from './evm';
export * from './prismaRepository';
export * from './transfers';
export * from './worker';

export type Hex = `0x${string}`;

export const CCTP_DOMAIN = {
  ETHEREUM: 0,
  BASE: 6,
  STELLAR: 27,
} as const;

export type CctpDomain = typeof CCTP_DOMAIN[keyof typeof CCTP_DOMAIN];

export type CctpNetworkKey =
  | 'ethereum'
  | 'ethereum-sepolia'
  | 'base'
  | 'base-sepolia'
  | 'stellar'
  | 'stellar-testnet';

export interface CctpNetworkConfig {
  key: CctpNetworkKey;
  label: string;
  family: 'evm' | 'stellar';
  environment: 'mainnet' | 'testnet';
  domain: CctpDomain;
  chainId?: number;
  usdcAddress?: Hex;
  tokenMessengerV2?: Hex;
  messageTransmitterV2?: Hex;
  cctpForwarder?: string;
  usdcDecimals: 6 | 7;
  explorerTxUrl: string;
}

export const CCTP_NETWORKS: Record<CctpNetworkKey, CctpNetworkConfig> = {
  ethereum: {
    key: 'ethereum',
    label: 'Ethereum',
    family: 'evm',
    environment: 'mainnet',
    domain: CCTP_DOMAIN.ETHEREUM,
    chainId: 1,
    usdcAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    tokenMessengerV2: '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d',
    messageTransmitterV2: '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64',
    usdcDecimals: 6,
    explorerTxUrl: 'https://etherscan.io/tx/',
  },
  'ethereum-sepolia': {
    key: 'ethereum-sepolia',
    label: 'Ethereum Sepolia',
    family: 'evm',
    environment: 'testnet',
    domain: CCTP_DOMAIN.ETHEREUM,
    chainId: 11155111,
    usdcAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    tokenMessengerV2: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
    messageTransmitterV2: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
    usdcDecimals: 6,
    explorerTxUrl: 'https://sepolia.etherscan.io/tx/',
  },
  base: {
    key: 'base',
    label: 'Base',
    family: 'evm',
    environment: 'mainnet',
    domain: CCTP_DOMAIN.BASE,
    chainId: 8453,
    usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    tokenMessengerV2: '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d',
    messageTransmitterV2: '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64',
    usdcDecimals: 6,
    explorerTxUrl: 'https://basescan.org/tx/',
  },
  'base-sepolia': {
    key: 'base-sepolia',
    label: 'Base Sepolia',
    family: 'evm',
    environment: 'testnet',
    domain: CCTP_DOMAIN.BASE,
    chainId: 84532,
    usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    tokenMessengerV2: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
    messageTransmitterV2: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
    usdcDecimals: 6,
    explorerTxUrl: 'https://sepolia.basescan.org/tx/',
  },
  stellar: {
    key: 'stellar',
    label: 'Stellar',
    family: 'stellar',
    environment: 'mainnet',
    domain: CCTP_DOMAIN.STELLAR,
    cctpForwarder: 'CBZL2IH7F6BIDAA3WBNXYKIXSATJGMSW7K5P5MJ6STX5RXN47TZJDF5T',
    usdcDecimals: 7,
    explorerTxUrl: 'https://stellar.expert/explorer/public/tx/',
  },
  'stellar-testnet': {
    key: 'stellar-testnet',
    label: 'Stellar Testnet',
    family: 'stellar',
    environment: 'testnet',
    domain: CCTP_DOMAIN.STELLAR,
    cctpForwarder: 'CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ',
    usdcDecimals: 7,
    explorerTxUrl: 'https://stellar.expert/explorer/testnet/tx/',
  },
};

export interface EvmDepositForBurnWithHookToStellarParams {
  amount: bigint;
  cctpForwarderStrkey: string;
  burnToken: Hex | string;
  maxFee: bigint;
  minFinalityThreshold: number;
  forwardRecipientStrkey: string;
}

export interface DepositForBurnWithHookArgs {
  amount: bigint;
  destinationDomain: typeof CCTP_DOMAIN.STELLAR;
  mintRecipient: Hex;
  burnToken: Hex | string;
  destinationCaller: Hex;
  maxFee: bigint;
  minFinalityThreshold: number;
  hookData: Hex;
}

const isHex = (value: string): value is Hex => /^0x[0-9a-fA-F]*$/.test(value);

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const assertValidStellarRecipient = (strkey: string) => {
  const valid =
    StrKey.isValidEd25519PublicKey(strkey) ||
    StrKey.isValidContract(strkey) ||
    StrKey.isValidMed25519PublicKey(strkey);
  if (!valid) throw new Error(`Invalid Stellar recipient: ${strkey}`);
};

export const isValidEvmAddress = (address: string): boolean =>
  /^0x[0-9a-fA-F]{40}$/.test(address);

export const isValidStellarAddress = (strkey: string): boolean => {
  try {
    assertValidStellarRecipient(strkey);
    return true;
  } catch {
    return false;
  }
};

export const stellarStrkeyToBytes32 = (strkey: string): Hex => {
  if (StrKey.isValidContract(strkey)) {
    return `0x${bytesToHex(StrKey.decodeContract(strkey))}`;
  }
  if (StrKey.isValidEd25519PublicKey(strkey)) {
    return `0x${bytesToHex(StrKey.decodeEd25519PublicKey(strkey))}`;
  }
  if (StrKey.isValidMed25519PublicKey(strkey)) {
    return `0x${bytesToHex(StrKey.decodeMed25519PublicKey(strkey))}`;
  }
  throw new Error(`Invalid Stellar address: ${strkey}`);
};

export const buildCctpForwarderHookData = (forwardRecipientStrkey: string): Hex => {
  assertValidStellarRecipient(forwardRecipientStrkey);

  const recipientBytes = new TextEncoder().encode(forwardRecipientStrkey);
  const hookData = new Uint8Array(32 + recipientBytes.length);
  const view = new DataView(hookData.buffer);
  view.setUint32(24, 0);
  view.setUint32(28, recipientBytes.length);
  hookData.set(recipientBytes, 32);
  return `0x${bytesToHex(hookData)}`;
};

export const humanUsdcToCctpAmount = (amount: string | number): bigint => {
  const value = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error(`Invalid USDC amount: ${value}`);

  const parts = value.split('.');
  const whole = parts[0] ?? '0';
  const fractional = parts[1] ?? '';
  const sixDecimals = fractional.padEnd(6, '0').slice(0, 6);
  return BigInt(whole) * 1_000_000n + BigInt(sixDecimals || '0');
};

export const cctpAmountToHumanUsdc = (amount: bigint | number | string): string => {
  const raw = BigInt(amount);
  const sign = raw < 0n ? '-' : '';
  const abs = raw < 0n ? -raw : raw;
  const whole = abs / 1_000_000n;
  const fractional = (abs % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return `${sign}${whole.toString()}${fractional ? `.${fractional}` : ''}`;
};

export const explorerTxUrl = (networkKey: CctpNetworkKey, txHash: string): string => {
  const network = CCTP_NETWORKS[networkKey];
  if (!network) throw new Error(`Unsupported CCTP network: ${networkKey}`);
  return `${network.explorerTxUrl}${txHash}`;
};

export const prepareEvmDepositForBurnWithHookToStellar = ({
  amount,
  cctpForwarderStrkey,
  burnToken,
  maxFee,
  minFinalityThreshold,
  forwardRecipientStrkey,
}: EvmDepositForBurnWithHookToStellarParams): DepositForBurnWithHookArgs => {
  if (!StrKey.isValidContract(cctpForwarderStrkey)) {
    throw new Error(`Invalid Stellar CctpForwarder contract: ${cctpForwarderStrkey}`);
  }
  if (typeof burnToken === 'string' && burnToken.startsWith('0x') && !isHex(burnToken)) {
    throw new Error(`Invalid EVM burn token: ${burnToken}`);
  }
  const cctpForwarderHex = stellarStrkeyToBytes32(cctpForwarderStrkey);
  return {
    amount,
    destinationDomain: CCTP_DOMAIN.STELLAR,
    mintRecipient: cctpForwarderHex,
    burnToken,
    destinationCaller: cctpForwarderHex,
    maxFee,
    minFinalityThreshold,
    hookData: buildCctpForwarderHookData(forwardRecipientStrkey),
  };
};
