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

const EMPTY = { rewardPool: 0n, totalDeposits: 0n };

async function getPeriodData(lockPeriod: number, contractId: string) {
  try {
    const contract = new Contract(contractId);
    const server = new rpc.Server('https://soroban-testnet.stellar.org');
    
    // Create a dummy account for simulation
    const keypair = Keypair.random();
    const account = new Account(keypair.publicKey(), '0');
    
    // Create the operation using contract.call()
    const operation = contract.call(
      'get_period_data',
      nativeToScVal(lockPeriod / 1000, { type: 'u64' }),
    );
    
    // Build the transaction
    const transaction = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();
    
    // Simulate the transaction
    const simulation = await server.simulateTransaction(transaction);
    
    // Check for errors
    if (rpc.Api.isSimulationError(simulation)) {
      console.warn('Simulation error:', simulation.error, { lockPeriod, contractId });
      return EMPTY;
    }
    
    // Get the return value
    const returnValue = simulation.result?.retval;
    
    if (!returnValue) {
      console.warn('No period data found', { lockPeriod, contractId });
      return EMPTY;
    }
    
    // Convert the result to native JavaScript types
    const periodData = scValToNative(returnValue);
    
    // Handle Option<Period> - if null/undefined, no data exists
    if (!periodData) {
      console.warn('No period data found for this lock period', { lockPeriod, contractId });
      return EMPTY;
    }
    
    return {
      rewardPool: periodData.reward_pool.toString(),
      totalDeposits: periodData.total_deposits.toString(),
    };
    
  } catch (error) {
    console.error('Failed to get period data:', error, { lockPeriod, contractId });
    return EMPTY;
  }
}

export { getPeriodData };
