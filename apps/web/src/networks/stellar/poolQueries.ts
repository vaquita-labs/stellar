import {
  Account,
  Contract,
  Keypair,
  Networks,
  rpc,
  scValToNative,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { getRpcUrl, getNetworkPassphrase } from './kit';

/**
 * Simulate `VaquitaPool::is_paused()` against the Soroban RPC.
 * Never throws — returns `false` on error so callers degrade gracefully.
 */
export async function getIsPoolPaused(contractId: string): Promise<boolean> {
  if (!contractId) return false;
  try {
    const rpcUrl = getRpcUrl();
    const networkPassphrase = getNetworkPassphrase() as Networks;
    const contract = new Contract(contractId);
    const server = new rpc.Server(rpcUrl);
    const keypair = Keypair.random();
    const account = new Account(keypair.publicKey(), '0');
    const operation = contract.call('is_paused');
    const transaction = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();
    const simulation = await server.simulateTransaction(transaction);
    if (rpc.Api.isSimulationError(simulation)) return false;
    const returnValue = simulation.result?.retval;
    if (!returnValue) return false;
    return Boolean(scValToNative(returnValue));
  } catch {
    return false;
  }
}
