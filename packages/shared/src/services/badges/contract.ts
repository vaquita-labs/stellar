import {
  Account,
  Address,
  Contract,
  Keypair,
  nativeToScVal,
  rpc,
  scValToNative,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';
import { resolveNetworkPassphrase } from '../stellar/passphrase';
import { resolveSorobanRpcUrl } from '../stellar/rpc';

function getRpcUrl(): string {
  return resolveSorobanRpcUrl();
}

function getNetworkPassphrase(): string {
  return resolveNetworkPassphrase();
}

async function simulateCall(contractId: string, method: string, ...args: xdr.ScVal[]) {
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

export async function contractHasClaimed(
  contractId: string,
  wallet: string,
  badgeType: string,
  cycleId: number,
): Promise<boolean> {
  try {
    const retval = await simulateCall(
      contractId,
      'has_claimed',
      new Address(wallet).toScVal(),
      nativeToScVal(badgeType, { type: 'symbol' }),
      nativeToScVal(cycleId, { type: 'u32' }),
    );
    if (!retval) return false;
    return scValToNative(retval) as boolean;
  } catch {
    return false;
  }
}
