import { PoolContractV2, RequestType } from '@blend-capital/blend-sdk';
import { rpc, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import { getNetworkPassphrase, getRpcUrl, getStellarNetwork } from './kit';
import { getPollarBinding } from './wallet/adapters/pollar-adapter';

const DEFAULT_BLEND_MAINNET_POOL = 'CCCCIQSDILITHMM7PBSLVDT5MISSY7R26MNZXCX4H7J5JQ5FPIYOGYFS';
const DEFAULT_BLEND_MAINNET_USDC = 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75';

const toBaseUnits = (input: string, decimals: number): bigint => {
  const [wholeRaw = '0', fractionalRaw = ''] = input.trim().split('.');
  const whole = wholeRaw.replace(/^0+/, '') || '0';
  const fractional = fractionalRaw.slice(0, decimals).padEnd(decimals, '0');
  const combined = `${whole}${fractional}`;
  if (!/^\d+$/.test(combined)) throw new Error('Invalid amount');
  return BigInt(combined);
};

export const directBlendMainnetSupply = async ({
  address,
  amount,
  decimals,
}: {
  address: string;
  amount: string;
  decimals: number;
}): Promise<{ hash: string }> => {
  if (getStellarNetwork() !== 'mainnet') {
    throw new Error('Direct Blend deposits are only available on Stellar mainnet');
  }
  if (!address) throw new Error('No connected address');

  const binding = getPollarBinding();
  if (!binding) throw new Error('Pollar adapter is not bound yet. Connect your wallet first.');

  const poolId = process.env.NEXT_PUBLIC_BLEND_MAINNET_POOL_CONTRACT_ID || DEFAULT_BLEND_MAINNET_POOL;
  const usdcId = process.env.NEXT_PUBLIC_BLEND_MAINNET_USDC_CONTRACT_ID || DEFAULT_BLEND_MAINNET_USDC;
  const rawAmount = toBaseUnits(amount, decimals);
  if (rawAmount <= 0n) throw new Error('Amount must be greater than zero');

  const pool = new PoolContractV2(poolId);
  const submitOperation = xdr.Operation.fromXDR(
    pool.submit({
      from: address,
      spender: address,
      to: address,
      requests: [{
        request_type: RequestType.SupplyCollateral,
        address: usdcId,
        amount: rawAmount,
      }],
    }),
    'base64',
  );

  const server = new rpc.Server(getRpcUrl());
  const account = await server.getAccount(address);
  const transaction = new TransactionBuilder(account, {
    fee: process.env.NEXT_PUBLIC_BLEND_MAINNET_FEE_STROOPS || '1000000',
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(submitOperation)
    .setTimeout(60)
    .build();

  const prepared = await server.prepareTransaction(transaction);
  const outcome = await binding.client.signAndSubmitTx(prepared.toXDR());
  if (outcome.status === 'error') {
    throw new Error(outcome.details ?? 'Blend deposit failed');
  }
  return { hash: outcome.hash };
};
