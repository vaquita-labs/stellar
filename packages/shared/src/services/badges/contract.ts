import {
  Account,
  Contract,
  Keypair,
  nativeToScVal,
  Networks,
  rpc,
  scValToNative,
  TransactionBuilder,
} from '@stellar/stellar-sdk';

const DEFAULT_SOROBAN_RPC = 'https://soroban-testnet.stellar.org';

function getRpcUrl(): string {
  return process.env.STELLAR_TESTNET_SOROBAN_RPC ?? DEFAULT_SOROBAN_RPC;
}

function getNetworkPassphrase(): string {
  return process.env.STELLAR_NETWORK_PASSPHRASE ?? Networks.TESTNET;
}

async function simulateCall(contractId: string, method: string, ...args: ReturnType<typeof nativeToScVal>[]) {
  const contract = new Contract(contractId);
  const server = new rpc.Server(getRpcUrl());
  const keypair = Keypair.random();
  const account = new Account(keypair.publicKey(), '0');

  const operation = contract.call(method, ...args);
  const tx = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();

  const simulation = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simulation)) return null;
  return simulation.result?.retval ?? null;
}

export async function contractOwnerOf(contractId: string, tokenId: number): Promise<string | null> {
  try {
    const retval = await simulateCall(contractId, 'owner_of', nativeToScVal(tokenId, { type: 'u32' }));
    if (!retval) return null;
    const native = scValToNative(retval);
    return (native as string | null) ?? null;
  } catch {
    return null;
  }
}

export async function contractBadgeTypeOf(contractId: string, tokenId: number): Promise<string | null> {
  try {
    const retval = await simulateCall(contractId, 'badge_type_of', nativeToScVal(tokenId, { type: 'u32' }));
    if (!retval) return null;
    const native = scValToNative(retval);
    return (native as string | null) ?? null;
  } catch {
    return null;
  }
}
