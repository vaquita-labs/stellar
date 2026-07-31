import type { TxBuildBody } from '@pollar/core';
import { Asset, rpc } from '@stellar/stellar-sdk';
import type { BridgeNetworkKey } from '@/core-ui/hooks';
import { getNetworkPassphrase, getRpcUrl, getStellarNetwork } from './kit';
import { submitAndSettle } from './pollarError';
import { getPollarBinding } from './wallet/adapters/pollar-adapter';

type StellarCctpConfig = {
  tokenMessengerMinter: string;
  usdcIssuer: string;
};

type StellarToEvmBurnInput = {
  sourceNetwork: BridgeNetworkKey;
  destinationNetwork: BridgeNetworkKey;
  sourceWallet: string;
  destinationWallet: string;
  amount: bigint;
  maxFee?: bigint;
  minFinalityThreshold?: number;
};

type StellarCctpApproveInput = {
  sourceNetwork: BridgeNetworkKey;
  sourceWallet: string;
  amount: bigint;
};

const CCTP_DOMAIN_BY_EVM_NETWORK: Partial<Record<BridgeNetworkKey, number>> = {
  ethereum: 0,
  'ethereum-sepolia': 0,
  base: 6,
  'base-sepolia': 6,
};

const STELLAR_CCTP_CONFIG: Partial<Record<BridgeNetworkKey, StellarCctpConfig>> = {
  stellar: {
    tokenMessengerMinter: 'CAE2G5Z77UP7GYPYGFOWFGW7C7J6I4YP2AFGSADRKQY62SYUFLPNFTXL',
    usdcIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  },
  'stellar-testnet': {
    tokenMessengerMinter: 'CDNG7HXAPBWICI2E3AUBP3YZWZELJLYSB6F5CC7WLDTLTHVM74SLRTHP',
    usdcIssuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  },
};

const CCTP_FAST_FINALITY_THRESHOLD = 1000;
const ZERO_BYTES_32 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const STELLAR_APPROVAL_EXPIRATION_LEDGERS = 120_960;

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const evmAddressToBytes32Base64 = (address: string) => {
  const hex = address.replace(/^0x/i, '').toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(hex)) throw new Error('Invalid EVM destination wallet');
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 20; i += 1) {
    bytes[12 + i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytesToBase64(bytes);
};

const stellarConfigFor = (network: BridgeNetworkKey) => {
  const config = STELLAR_CCTP_CONFIG[network];
  if (!config) throw new Error(`Unsupported Stellar CCTP network: ${network}`);
  return config;
};

const assertPollarSourceWallet = (sourceWallet: string) => {
  const binding = getPollarBinding();
  if (!binding) throw new Error('Connect your Stellar wallet before sending');
  if (binding.walletAddress !== sourceWallet) {
    throw new Error('Connected Stellar wallet does not match the wallet you send from');
  }
  return binding.client;
};

const assertStellarNetworkMatches = (sourceNetwork: BridgeNetworkKey) => {
  const expected = getStellarNetwork() === 'mainnet' ? 'stellar' : 'stellar-testnet';
  if (sourceNetwork !== expected) {
    throw new Error(`Switch Stellar network to ${sourceNetwork}`);
  }
};

const stellarUsdcContractFor = (source: StellarCctpConfig) =>
  new Asset('USDC', source.usdcIssuer).contractId(getNetworkPassphrase());

const getApprovalExpirationLedger = async () => {
  const server = new rpc.Server(getRpcUrl());
  const latest = await server.getLatestLedger();
  return Number(latest.sequence) + STELLAR_APPROVAL_EXPIRATION_LEDGERS;
};

export const buildStellarCctpApproveParams = ({
  sourceNetwork,
  sourceWallet,
  amount,
  expirationLedger,
}: StellarCctpApproveInput & { expirationLedger: number }): Extract<TxBuildBody, { operation: 'invoke_contract' }>['params'] => {
  const source = stellarConfigFor(sourceNetwork);
  if (amount <= 0n) throw new Error('Approval amount must be greater than zero');
  return {
    contractId: stellarUsdcContractFor(source),
    method: 'approve',
    args: [
      { type: 'address', value: sourceWallet },
      { type: 'address', value: source.tokenMessengerMinter },
      { type: 'i128', value: amount.toString() },
      { type: 'u32', value: expirationLedger },
    ],
  };
};

/**
 * Approve the TokenMessenger to move `amount` of the wallet's USDC. The burn is a
 * separate transaction that reads this allowance from the ledger, so the hash is
 * returned only once the approval is confirmed there.
 */
export const approveStellarCctpSpend = async ({
  sourceWallet,
  ...input
}: StellarCctpApproveInput): Promise<{ hash: string }> => {
  assertStellarNetworkMatches(input.sourceNetwork);
  const client = assertPollarSourceWallet(sourceWallet);
  const params = buildStellarCctpApproveParams({
    sourceWallet,
    ...input,
    expirationLedger: await getApprovalExpirationLedger(),
  });
  return submitAndSettle(
    client,
    () => client.buildAndSignAndSubmitTx('invoke_contract', params),
    'Stellar USDC approval failed',
  );
};

export const buildStellarToEvmBurnParams = ({
  sourceNetwork,
  destinationNetwork,
  sourceWallet,
  destinationWallet,
  amount,
  maxFee = 0n,
  minFinalityThreshold = CCTP_FAST_FINALITY_THRESHOLD,
}: StellarToEvmBurnInput): Extract<TxBuildBody, { operation: 'invoke_contract' }>['params'] => {
  const source = stellarConfigFor(sourceNetwork);
  const destinationDomain = CCTP_DOMAIN_BY_EVM_NETWORK[destinationNetwork];
  if (destinationDomain === undefined) throw new Error(`Unsupported EVM destination network: ${destinationNetwork}`);
  if (amount <= 0n) throw new Error('Amount must be greater than zero');

  return {
    contractId: source.tokenMessengerMinter,
    method: 'deposit_for_burn',
    args: [
      { type: 'address', value: sourceWallet },
      { type: 'i128', value: amount.toString() },
      { type: 'u32', value: destinationDomain },
      { type: 'bytes', value: evmAddressToBytes32Base64(destinationWallet) },
      { type: 'address', value: stellarUsdcContractFor(source) },
      { type: 'bytes', value: ZERO_BYTES_32 },
      { type: 'i128', value: maxFee.toString() },
      { type: 'u32', value: minFinalityThreshold },
    ],
  };
};

/**
 * Burn the USDC on Stellar so Circle's attestation service can mint it on the EVM
 * side. The attestation is keyed on the burn landing in a ledger, so the hash is
 * returned only once it did.
 */
export const signStellarToEvmSourceBurn = async ({
  sourceWallet,
  ...input
}: StellarToEvmBurnInput): Promise<{ hash: string }> => {
  assertStellarNetworkMatches(input.sourceNetwork);
  const client = assertPollarSourceWallet(sourceWallet);
  const params = buildStellarToEvmBurnParams({ sourceWallet, ...input });
  return submitAndSettle(
    client,
    () => client.buildAndSignAndSubmitTx('invoke_contract', params),
    'Stellar CCTP burn failed',
  );
};
