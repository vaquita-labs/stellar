import { RequestType } from '@blend-capital/blend-sdk';
import {
  Address,
  Contract,
  nativeToScVal,
  rpc,
  scValToNative,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import type { NetworkResponseDTO } from '@/core-ui/types';
import { getNetworkPassphrase, getRpcUrl } from './kit';
import { describeOutcomeError, runWithErrorCapture } from './pollarError';
import { getPollarBinding } from './wallet/adapters/pollar-adapter';

export interface BlendConfig {
  poolId: string;
  usdcId: string;
  /** Issuer (G-address) of the USDC Blend accepts. Tells it apart from other
   *  USDC assets from different issuers (relevant on testnet). */
  usdcIssuer: string;
  feeStroops: string;
}

/**
 * Blend pool, the USDC it accepts and its issuer come from the token row of
 * the project config (DB → API → config store), same source as the Vaquita
 * pool and the DeFindex vault. Null while the config has not loaded or when
 * the token has no Blend pool configured (Admin → Tokens → Edit).
 */
export const blendConfigForToken = (
  token: NetworkResponseDTO['tokens'][number] | null,
): BlendConfig | null => {
  if (!token?.blendPoolContractAddress || !token.contractAddress || !token.issuer) return null;
  return {
    poolId: token.blendPoolContractAddress,
    usdcId: token.contractAddress,
    usdcIssuer: token.issuer,
    feeStroops: clientEnv.NEXT_PUBLIC_BLEND_FEE_STROOPS,
  };
};

/**
 * Non-reactive read of the ACTIVE token's Blend config, for imperative call
 * sites (transaction submission, balance reads). React code must derive it
 * from the store subscription instead: `blendConfigForToken(useConfigStore(s => s.token))`.
 */
export const getBlendConfig = (): BlendConfig | null =>
  blendConfigForToken(useConfigStore.getState().token);

const toBaseUnits = (input: string, decimals: number): bigint => {
  const [wholeRaw = '0', fractionalRaw = ''] = input.trim().split('.');
  const whole = wholeRaw.replace(/^0+/, '') || '0';
  const fractional = fractionalRaw.slice(0, decimals).padEnd(decimals, '0');
  const combined = `${whole}${fractional}`;
  if (!/^\d+$/.test(combined)) throw new Error('Invalid amount');
  return BigInt(combined);
};

// Sentinel "retirá todo": Blend interpreta un monto ≥ posición como "hasta el
// máximo disponible", así que al retirar el total pasamos i128::MAX y el pool
// saca capital + interés sin dejar polvo por lo que se devengó entre teclear y
// firmar. (i128 max = 2^127 − 1.)
const I128_MAX = (1n << 127n) - 1n;

/**
 * Codifica el `Request` de Blend (`{ address, amount, request_type }`) como el
 * ScVal-map que entiende `/tx/build` de Pollar. Las claves van en orden
 * alfabético porque un SCMap de Soroban debe estar ordenado por clave.
 */
const encodeBlendRequest = (usdcId: string, requestType: RequestType, rawAmount: bigint) => ({
  type: 'map' as const,
  value: [
    { key: { type: 'symbol', value: 'address' }, val: { type: 'address', value: usdcId } },
    { key: { type: 'symbol', value: 'amount' }, val: { type: 'i128', value: rawAmount.toString() } },
    { key: { type: 'symbol', value: 'request_type' }, val: { type: 'u32', value: requestType } },
  ],
});

/**
 * Manda un `submit` de Blend con un único request sobre el USDC de la red activa.
 * `directBlendSupply` / `directBlendWithdraw` son wrappers sobre esto; comparten
 * resolución de pool/USDC/fee.
 *
 * La operación la ARMA POLLAR: le pasamos la intención (`invoke_contract` +
 * contrato + método + args) y su backend hace build → simulate → firma → submit
 * en un solo round-trip (`/tx/build-sign-submit`). Así el fee y el patrocinio los
 * decide el server, que es el único que puede aplicar la política de sponsorship
 * de la app; armándola en el browser el fee salía de la cuenta del usuario y un
 * custodial sin XLM moría con `txInsufficientBalance`.
 */
const submitBlendRequest = async (
  requestType: RequestType,
  {
    address,
    amount,
    decimals,
    max,
  }: { address: string; amount: string; decimals: number; max?: boolean },
): Promise<{ hash: string }> => {
  const config = getBlendConfig();
  if (!config) throw new Error('Blend pool is not configured for this token');
  if (!address) throw new Error('No connected address');

  const binding = getPollarBinding();
  if (!binding) throw new Error('Pollar adapter is not bound yet. Connect your wallet first.');

  const rawAmount = max ? I128_MAX : toBaseUnits(amount, decimals);
  if (rawAmount <= 0n) throw new Error('Amount must be greater than zero');

  const { outcome, lastError } = await runWithErrorCapture(binding.client, () =>
    binding.client.buildAndSignAndSubmitTx(
      'invoke_contract',
      {
        contractId: config.poolId,
        method: 'submit',
        // submit(from, spender, to, requests): las tres direcciones son el usuario
        // (deposita lo suyo y recibe lo suyo), y el pool cobra/paga vía el USDC.
        args: [
          { type: 'address', value: address },
          { type: 'address', value: address },
          { type: 'address', value: address },
          { type: 'vec', value: [encodeBlendRequest(config.usdcId, requestType, rawAmount)] },
        ],
      },
    ),
  );
  if (outcome.status === 'error') {
    throw new Error(describeOutcomeError(outcome, lastError, 'Blend transaction failed'));
  }
  return { hash: outcome.hash };
};

/**
 * Deposita (SupplyCollateral) USDC directo al pool de Blend de la red activa,
 * sin lock de Vaquita. Funciona en cualquier red que tenga un pool configurado.
 */
export const directBlendSupply = (input: {
  address: string;
  amount: string;
  decimals: number;
}): Promise<{ hash: string }> => submitBlendRequest(RequestType.SupplyCollateral, input);

/**
 * Retira (WithdrawCollateral) el USDC que el usuario tiene puesto directo en
 * Blend. El pool paga a la misma dirección (`to = address`). Con `withdrawAll`
 * saca la posición entera (capital + interés) usando el sentinel i128::MAX.
 */
export const directBlendWithdraw = ({
  address,
  amount,
  decimals,
  withdrawAll,
}: {
  address: string;
  amount: string;
  decimals: number;
  withdrawAll?: boolean;
}): Promise<{ hash: string }> =>
  submitBlendRequest(RequestType.WithdrawCollateral, { address, amount, decimals, max: withdrawAll });

/**
 * Transfiere USDC (el SAC de la red activa) de una cuenta a otra vía un `transfer`
 * Soroban, firmado y enviado por Pollar (`signAndSubmitTx`). Se usa como salto 2
 * del retiro social (custodial → wallet externa): a diferencia de `sendPayment`
 * (pago clásico, NO patrocinado), esta vía Soroban SÍ la patrocina Pollar, así que
 * funciona con 0 XLM. El destino debe tener trustline al USDC para recibir.
 */
export const directUsdcTransfer = async ({
  from,
  to,
  amount,
  decimals,
}: {
  from: string;
  to: string;
  amount: string;
  decimals: number;
}): Promise<{ hash: string }> => {
  const config = getBlendConfig();
  if (!config) throw new Error('Blend pool is not configured for this token');

  const binding = getPollarBinding();
  if (!binding) throw new Error('Pollar adapter is not bound yet. Connect your wallet first.');

  const rawAmount = toBaseUnits(amount, decimals);
  if (rawAmount <= 0n) throw new Error('Amount must be greater than zero');

  const usdc = new Contract(config.usdcId);
  const transferOp = usdc.call(
    'transfer',
    Address.fromString(from).toScVal(),
    Address.fromString(to).toScVal(),
    nativeToScVal(rawAmount, { type: 'i128' }),
  );

  const server = new rpc.Server(getRpcUrl());
  const account = await server.getAccount(from);
  const transaction = new TransactionBuilder(account, {
    fee: config.feeStroops,
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(transferOp)
    .setTimeout(60)
    .build();

  const prepared = await server.prepareTransaction(transaction);
  const { outcome, lastError } = await runWithErrorCapture(binding.client, () =>
    binding.client.signAndSubmitTx(prepared.toXDR()),
  );
  if (outcome.status === 'error') {
    throw new Error(describeOutcomeError(outcome, lastError, 'USDC transfer failed'));
  }
  return { hash: outcome.hash };
};

/**
 * Lee (read-only) el saldo del USDC de Blend de una cuenta, en unidades humanas.
 * Se usa tras un retiro del Vaquita pool para saber "todo lo recibido" y volver a
 * depositarlo en Blend. Simula `balance()` del SAC; devuelve 0 ante cualquier error.
 */
export const getBlendUsdcBalance = async (address: string, decimals: number): Promise<number> => {
  const config = getBlendConfig();
  if (!config || !address) return 0;
  try {
    const server = new rpc.Server(getRpcUrl());
    const usdc = new Contract(config.usdcId);
    const account = await server.getAccount(address);
    const tx = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: getNetworkPassphrase(),
    })
      .addOperation(usdc.call('balance', Address.fromString(address).toScVal()))
      .setTimeout(30)
      .build();
    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim) || !sim.result) return 0;
    const raw = scValToNative(sim.result.retval) as bigint;
    return Number(raw) / 10 ** decimals;
  } catch {
    return 0;
  }
};

/**
 * @deprecated Usar `directBlendSupply`. Alias de compatibilidad: el nombre
 * "Mainnet" quedó obsoleto cuando el depósito pasó a resolverse por red.
 */
export const directBlendMainnetSupply = directBlendSupply;
