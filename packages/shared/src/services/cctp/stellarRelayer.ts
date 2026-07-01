import {
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';
import { CCTP_NETWORKS } from './index';
import type { BridgeTransferRecord } from './transfers';

const DEFAULT_TESTNET_RPC = 'https://soroban-testnet.stellar.org';
const DEFAULT_MAINNET_RPC = 'https://soroban-rpc.mainnet.stellar.org:443';

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
};

const rpcUrlFor = (networkKey: string): string => {
  const network = CCTP_NETWORKS[networkKey as keyof typeof CCTP_NETWORKS];
  if (network?.environment === 'mainnet') {
    return process.env.STELLAR_MAINNET_SOROBAN_RPC || DEFAULT_MAINNET_RPC;
  }
  return process.env.STELLAR_TESTNET_SOROBAN_RPC || DEFAULT_TESTNET_RPC;
};

const passphraseFor = (networkKey: string): string => {
  const network = CCTP_NETWORKS[networkKey as keyof typeof CCTP_NETWORKS];
  if (process.env.STELLAR_NETWORK_PASSPHRASE) return process.env.STELLAR_NETWORK_PASSPHRASE;
  return network?.environment === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
};

const hexToBytesScVal = (value: string): xdr.ScVal => {
  const hex = value.replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error('Expected 0x-prefixed hex bytes');
  }
  return xdr.ScVal.scvBytes(Buffer.from(hex, 'hex'));
};

export const relayStellarMintAndForward = async (
  transfer: BridgeTransferRecord,
): Promise<{ destinationTxHash: string }> => {
  if (transfer.direction !== 'evm_to_stellar') {
    throw new Error(`Unsupported relay direction: ${transfer.direction}`);
  }
  if (transfer.destinationNetwork !== 'stellar' && transfer.destinationNetwork !== 'stellar-testnet') {
    throw new Error(`Destination network is not Stellar: ${transfer.destinationNetwork}`);
  }
  if (!transfer.cctpMessage || !transfer.cctpAttestation) {
    throw new Error('CCTP message and attestation are required for destination relay');
  }

  const forwarder = CCTP_NETWORKS[transfer.destinationNetwork].cctpForwarder;
  if (!forwarder) throw new Error(`Missing CctpForwarder for ${transfer.destinationNetwork}`);

  const relayer = Keypair.fromSecret(requireEnv('BRIDGE_STELLAR_RELAYER_SECRET'));
  const server = new rpc.Server(rpcUrlFor(transfer.destinationNetwork));
  const account = await server.getAccount(relayer.publicKey());
  const contract = new Contract(forwarder);
  const transaction = new TransactionBuilder(account, {
    fee: process.env.BRIDGE_STELLAR_RELAYER_FEE_STROOPS || '1000000',
    networkPassphrase: passphraseFor(transfer.destinationNetwork),
  })
    .addOperation(contract.call(
      'mint_and_forward',
      hexToBytesScVal(transfer.cctpMessage),
      hexToBytesScVal(transfer.cctpAttestation),
    ))
    .setTimeout(Number(process.env.BRIDGE_STELLAR_RELAYER_TIMEOUT_SECONDS || '60'))
    .build();

  const prepared = await server.prepareTransaction(transaction);
  prepared.sign(relayer);
  const result = await server.sendTransaction(prepared);
  if (result.status === 'ERROR') {
    throw new Error(`Stellar relay submit failed: ${result.errorResult ?? 'unknown error'}`);
  }
  return { destinationTxHash: result.hash };
};
