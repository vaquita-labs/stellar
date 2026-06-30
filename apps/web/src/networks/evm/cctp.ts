import type { BridgeNetworkKey } from '@/core-ui/hooks';

type Hex = `0x${string}`;

type EvmNetworkConfig = {
  tokenMessengerV2: Hex;
  usdcAddress: Hex;
  cctpForwarder: string;
};

export type EvmTxRequest = {
  to: Hex;
  data: Hex;
};

type EvmToStellarBurnInput = {
  sourceNetwork: BridgeNetworkKey;
  destinationNetwork: BridgeNetworkKey;
  amount: bigint;
  maxFee?: bigint;
  forwardRecipientStrkey: string;
};

const CCTP_DOMAIN_STELLAR = 27;
const CCTP_FAST_FINALITY_THRESHOLD = 1000;
const ERC20_ALLOWANCE_SELECTOR = '0xdd62ed3e';
const ERC20_APPROVE_SELECTOR = '0x095ea7b3';
const DEPOSIT_FOR_BURN_WITH_HOOK_SELECTOR = '0x779b432d';

const EVM_CCTP_CONFIG: Partial<Record<BridgeNetworkKey, EvmNetworkConfig>> = {
  ethereum: {
    tokenMessengerV2: '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d',
    usdcAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    cctpForwarder: 'CBZL2IH7F6BIDAA3WBNXYKIXSATJGMSW7K5P5MJ6STX5RXN47TZJDF5T',
  },
  'ethereum-sepolia': {
    tokenMessengerV2: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
    usdcAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    cctpForwarder: 'CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ',
  },
  base: {
    tokenMessengerV2: '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d',
    usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    cctpForwarder: 'CBZL2IH7F6BIDAA3WBNXYKIXSATJGMSW7K5P5MJ6STX5RXN47TZJDF5T',
  },
  'base-sepolia': {
    tokenMessengerV2: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
    usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    cctpForwarder: 'CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ',
  },
};

const strip0x = (value: string) => value.replace(/^0x/i, '');

const assertHexLength = (value: string, length: number, label: string) => {
  const hex = strip0x(value);
  if (!new RegExp(`^[0-9a-fA-F]{${length}}$`).test(hex)) {
    throw new Error(`${label} must be ${length} hex characters`);
  }
  return hex.toLowerCase();
};

const uintWord = (value: bigint | number) => BigInt(value).toString(16).padStart(64, '0');
const addressWord = (address: string) => assertHexLength(address, 40, 'EVM address').padStart(64, '0');
const bytes32Word = (value: string) => assertHexLength(value, 64, 'ABI word');

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const crc16Xmodem = (payload: Uint8Array) => {
  let crc = 0;
  for (const byte of payload) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
};

const stellarStrkeyPayload = (strkey: string, expectedVersion: number) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of strkey.replace(/=+$/, '')) {
    const index = alphabet.indexOf(char.toUpperCase());
    if (index < 0) throw new Error(`Invalid Stellar strkey: ${strkey}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  const decoded = new Uint8Array(bytes);
  if (decoded.length !== 35 || decoded[0] !== expectedVersion) {
    throw new Error(`Invalid Stellar strkey: ${strkey}`);
  }
  const payload = decoded.slice(0, 33);
  const checksum = decoded[33]! | (decoded[34]! << 8);
  if (crc16Xmodem(payload) !== checksum) {
    throw new Error(`Invalid Stellar strkey checksum: ${strkey}`);
  }
  return decoded.slice(1, 33);
};

const stellarContractToBytes32 = (contractStrkey: string): Hex =>
  `0x${bytesToHex(stellarStrkeyPayload(contractStrkey, 16))}`;

const buildCctpForwarderHookData = (forwardRecipientStrkey: string): Hex => {
  const recipientBytes = new TextEncoder().encode(forwardRecipientStrkey);
  const hookData = new Uint8Array(32 + recipientBytes.length);
  const view = new DataView(hookData.buffer);
  view.setUint32(24, 0);
  view.setUint32(28, recipientBytes.length);
  hookData.set(recipientBytes, 32);
  return `0x${bytesToHex(hookData)}`;
};

const dynamicBytesWords = (value: string) => {
  const hex = strip0x(value);
  if (!/^[0-9a-fA-F]*$/.test(hex)) throw new Error('Dynamic bytes must be hex');
  const byteLength = hex.length / 2;
  const paddedLength = Math.ceil(byteLength / 32) * 64;
  return `${uintWord(byteLength)}${hex.padEnd(paddedLength, '0')}`;
};

const evmConfig = (network: BridgeNetworkKey) => {
  const config = EVM_CCTP_CONFIG[network];
  if (!config) throw new Error(`Missing EVM CCTP config for ${network}`);
  return config;
};

export const buildErc20AllowanceCall = (
  sourceNetwork: BridgeNetworkKey,
  owner: string,
): EvmTxRequest => {
  const config = evmConfig(sourceNetwork);
  return {
    to: config.usdcAddress,
    data: `${ERC20_ALLOWANCE_SELECTOR}${addressWord(owner)}${addressWord(config.tokenMessengerV2)}`,
  };
};

export const buildErc20ApproveTx = (
  sourceNetwork: BridgeNetworkKey,
  amount: bigint,
): EvmTxRequest => {
  const config = evmConfig(sourceNetwork);
  return {
    to: config.usdcAddress,
    data: `${ERC20_APPROVE_SELECTOR}${addressWord(config.tokenMessengerV2)}${uintWord(amount)}`,
  };
};

export const buildEvmToStellarBurnTx = ({
  sourceNetwork,
  amount,
  maxFee = 0n,
  forwardRecipientStrkey,
}: EvmToStellarBurnInput): EvmTxRequest => {
  const config = evmConfig(sourceNetwork);
  const forwarderBytes32 = stellarContractToBytes32(config.cctpForwarder);
  const hookData = buildCctpForwarderHookData(forwardRecipientStrkey);
  const staticWords = [
    uintWord(amount),
    uintWord(CCTP_DOMAIN_STELLAR),
    bytes32Word(forwarderBytes32),
    addressWord(config.usdcAddress),
    bytes32Word(forwarderBytes32),
    uintWord(maxFee),
    uintWord(CCTP_FAST_FINALITY_THRESHOLD),
    uintWord(8 * 32),
  ].join('');

  return {
    to: config.tokenMessengerV2,
    data: `${DEPOSIT_FOR_BURN_WITH_HOOK_SELECTOR}${staticWords}${dynamicBytesWords(hookData)}`,
  };
};
