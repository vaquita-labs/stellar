import {
  CCTP_DOMAIN,
  CCTP_NETWORKS,
  buildCctpForwarderHookData,
  stellarStrkeyToBytes32,
  type CctpNetworkConfig,
  type CctpNetworkKey,
  type Hex,
} from './index';

export interface EvmTxRequest {
  to: Hex;
  data: Hex;
}

export interface EvmToStellarBurnInput {
  sourceNetwork: CctpNetworkKey;
  destinationNetwork: CctpNetworkKey;
  amount: bigint;
  forwardRecipientStrkey: string;
  maxFee?: bigint;
  minFinalityThreshold?: number;
}

const ERC20_ALLOWANCE_SELECTOR = '0xdd62ed3e';
const ERC20_APPROVE_SELECTOR = '0x095ea7b3';
const DEPOSIT_FOR_BURN_WITH_HOOK_SELECTOR = '0x779b432d';
export const CCTP_FAST_FINALITY_THRESHOLD = 1000;

const strip0x = (value: string) => value.replace(/^0x/i, '');

const assertHexLength = (value: string, length: number, label: string) => {
  const hex = strip0x(value);
  if (!new RegExp(`^[0-9a-fA-F]{${length}}$`).test(hex)) {
    throw new Error(`${label} must be ${length} hex characters`);
  }
  return hex.toLowerCase();
};

const word = (hex: string) => assertHexLength(hex, 64, 'ABI word');
const uintWord = (value: bigint | number) => BigInt(value).toString(16).padStart(64, '0');
const addressWord = (address: string) => assertHexLength(address, 40, 'EVM address').padStart(64, '0');
const bytes32Word = (value: string) => word(value);

const dynamicBytesWords = (value: string) => {
  const hex = strip0x(value);
  if (!/^[0-9a-fA-F]*$/.test(hex)) throw new Error('Dynamic bytes must be hex');
  const byteLength = hex.length / 2;
  const paddedLength = Math.ceil(byteLength / 32) * 64;
  return `${uintWord(byteLength)}${hex.padEnd(paddedLength, '0')}`;
};

const networkConfig = (networkKey: CctpNetworkKey) => {
  const config = CCTP_NETWORKS[networkKey];
  if (!config) throw new Error(`Unsupported CCTP network: ${networkKey}`);
  return config;
};

const sourceEvmConfig = (networkKey: CctpNetworkKey) => {
  const config = networkConfig(networkKey);
  if (config.family !== 'evm') throw new Error(`Source network must be EVM: ${networkKey}`);
  const { tokenMessengerV2, usdcAddress } = config;
  if (!tokenMessengerV2 || !usdcAddress) {
    throw new Error(`Missing EVM CCTP config for ${networkKey}`);
  }
  return { ...config, tokenMessengerV2, usdcAddress } satisfies CctpNetworkConfig & {
    tokenMessengerV2: Hex;
    usdcAddress: Hex;
  };
};

const stellarForwarderFor = (networkKey: CctpNetworkKey) => {
  const config = networkConfig(networkKey);
  if (config.family !== 'stellar') throw new Error(`Destination network must be Stellar: ${networkKey}`);
  if (!config.cctpForwarder) throw new Error(`Missing Stellar CctpForwarder for ${networkKey}`);
  return config.cctpForwarder;
};

export const buildErc20AllowanceCall = (
  sourceNetwork: CctpNetworkKey,
  owner: string,
): EvmTxRequest => {
  const config = sourceEvmConfig(sourceNetwork);
  return {
    to: config.usdcAddress,
    data: `${ERC20_ALLOWANCE_SELECTOR}${addressWord(owner)}${addressWord(config.tokenMessengerV2)}`,
  };
};

export const buildErc20ApproveTx = (
  sourceNetwork: CctpNetworkKey,
  amount: bigint,
): EvmTxRequest => {
  const config = sourceEvmConfig(sourceNetwork);
  return {
    to: config.usdcAddress,
    data: `${ERC20_APPROVE_SELECTOR}${addressWord(config.tokenMessengerV2)}${uintWord(amount)}`,
  };
};

export const buildEvmToStellarBurnTx = ({
  sourceNetwork,
  destinationNetwork,
  amount,
  forwardRecipientStrkey,
  maxFee = 0n,
  minFinalityThreshold = CCTP_FAST_FINALITY_THRESHOLD,
}: EvmToStellarBurnInput): EvmTxRequest => {
  const source = sourceEvmConfig(sourceNetwork);
  const forwarder = stellarForwarderFor(destinationNetwork);
  const forwarderBytes32 = stellarStrkeyToBytes32(forwarder);
  const hookData = buildCctpForwarderHookData(forwardRecipientStrkey);
  const staticWords = [
    uintWord(amount),
    uintWord(CCTP_DOMAIN.STELLAR),
    bytes32Word(forwarderBytes32),
    addressWord(source.usdcAddress),
    bytes32Word(forwarderBytes32),
    uintWord(maxFee),
    uintWord(minFinalityThreshold),
    uintWord(8 * 32),
  ].join('');

  return {
    to: source.tokenMessengerV2,
    data: `${DEPOSIT_FOR_BURN_WITH_HOOK_SELECTOR}${staticWords}${dynamicBytesWords(hookData)}`,
  };
};
