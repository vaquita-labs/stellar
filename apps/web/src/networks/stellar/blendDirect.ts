import { PoolContractV2, RequestType } from '@blend-capital/blend-sdk';
import { Address, Contract, nativeToScVal, rpc, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import {
  getNetworkPassphrase,
  getRpcUrl,
  getStellarNetwork,
  isMainnet,
  type StellarNetwork,
} from './kit';
import { getPollarBinding } from './wallet/adapters/pollar-adapter';

// Blend V2 pool + el USDC (reserva) que ese pool acepta, por red. Son solo los
// defaults incrustados: cualquiera se puede pisar con las env NEXT_PUBLIC_BLEND_*
// de abajo, así que mover un deployment (o cambiar de red) es solo apuntar la
// var al lado correcto — sin "mainnet" cableado en la lógica.
const BLEND_DEFAULTS: Record<StellarNetwork, { pool: string; usdc: string; usdcIssuer: string }> = {
  mainnet: {
    pool: 'CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD',
    usdc: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
    // USDC oficial de Circle en mainnet (hay uno solo, no hay ambigüedad).
    usdcIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  },
  testnet: {
    pool: 'CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF',
    // El USDC de reserva del pool de testnet. Vacío ⇒ cae al USDC de la app
    // (NEXT_PUBLIC_USDC_CONTRACT_ID) en getBlendConfig(). Si el pool usa otro
    // asset, setealo con NEXT_PUBLIC_BLEND_USDC_CONTRACT_ID.
    usdc: '',
    // Emisor del USDC que envuelve el SAC de Blend en testnet (verificado on-chain
    // vía name() del contrato). OJO: en testnet hay VARIOS USDC de emisores
    // distintos; este es el ÚNICO que Blend acepta. En mainnet no pasa (uno solo).
    usdcIssuer: 'GATALTGTWIOT6BUDBCZM3Q4OQ4BO2COLOAZ7IYSKPLC2PMSOPPGF5V56',
  },
};

export interface BlendConfig {
  poolId: string;
  usdcId: string;
  /** Emisor (G-address) del USDC que acepta Blend. Sirve para no confundirlo con
   *  otros USDC de otros emisores (relevante en testnet). Vacío = no chequear. */
  usdcIssuer: string;
  feeStroops: string;
}

/**
 * Resuelve el pool de Blend, el USDC que acepta y el fee para la red ACTIVA.
 * Prioridad de cada valor: env genérica (NEXT_PUBLIC_BLEND_*) → env legacy
 * mainnet (solo si la red es mainnet, por compatibilidad) → default incrustado
 * de la red. Devuelve `null` si no hay pool+USDC para esta red, de modo que el
 * UI pueda deshabilitar el depósito sin cablearse a "mainnet".
 */
export const getBlendConfig = (): BlendConfig | null => {
  const network = getStellarNetwork();
  const defaults = BLEND_DEFAULTS[network];

  const poolId =
    process.env.NEXT_PUBLIC_BLEND_POOL_CONTRACT_ID ||
    (isMainnet() ? process.env.NEXT_PUBLIC_BLEND_MAINNET_POOL_CONTRACT_ID : undefined) ||
    defaults.pool;

  const usdcId =
    process.env.NEXT_PUBLIC_BLEND_USDC_CONTRACT_ID ||
    (isMainnet() ? process.env.NEXT_PUBLIC_BLEND_MAINNET_USDC_CONTRACT_ID : undefined) ||
    defaults.usdc ||
    process.env.NEXT_PUBLIC_USDC_CONTRACT_ID ||
    '';

  const usdcIssuer =
    process.env.NEXT_PUBLIC_BLEND_USDC_ISSUER || defaults.usdcIssuer || '';

  const feeStroops =
    process.env.NEXT_PUBLIC_BLEND_FEE_STROOPS ||
    process.env.NEXT_PUBLIC_BLEND_MAINNET_FEE_STROOPS ||
    '1000000';

  if (!poolId || !usdcId) return null;
  return { poolId, usdcId, usdcIssuer, feeStroops };
};

/** ¿Hay un pool de Blend configurado para la red activa? Gatea el CTA del modal. */
export const isBlendDepositAvailable = (): boolean => getBlendConfig() !== null;

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
 * Arma, firma y envía un `submit` de Blend con un único request sobre el USDC de
 * la red activa. `directBlendSupply` / `directBlendWithdraw` son wrappers sobre
 * esto; comparten resolución de pool/USDC/fee, RPC y firma vía Pollar.
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
  if (!config) {
    throw new Error('Blend is not configured for this network');
  }
  if (!address) throw new Error('No connected address');

  const binding = getPollarBinding();
  if (!binding) throw new Error('Pollar adapter is not bound yet. Connect your wallet first.');

  const rawAmount = max ? I128_MAX : toBaseUnits(amount, decimals);
  if (rawAmount <= 0n) throw new Error('Amount must be greater than zero');

  const pool = new PoolContractV2(config.poolId);
  const submitOperation = xdr.Operation.fromXDR(
    pool.submit({
      from: address,
      spender: address,
      to: address,
      requests: [{
        request_type: requestType,
        address: config.usdcId,
        amount: rawAmount,
      }],
    }),
    'base64',
  );

  const server = new rpc.Server(getRpcUrl());
  const account = await server.getAccount(address);
  const transaction = new TransactionBuilder(account, {
    fee: config.feeStroops,
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(submitOperation)
    .setTimeout(60)
    .build();

  const prepared = await server.prepareTransaction(transaction);
  const outcome = await binding.client.signAndSubmitTx(prepared.toXDR());
  if (outcome.status === 'error') {
    throw new Error(outcome.details ?? 'Blend transaction failed');
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
  if (!config) throw new Error('Blend is not configured for this network');

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
  const outcome = await binding.client.signAndSubmitTx(prepared.toXDR());
  if (outcome.status === 'error') {
    throw new Error(outcome.details ?? 'USDC transfer failed');
  }
  return { hash: outcome.hash };
};

/**
 * @deprecated Usar `directBlendSupply`. Alias de compatibilidad: el nombre
 * "Mainnet" quedó obsoleto cuando el depósito pasó a resolverse por red.
 */
export const directBlendMainnetSupply = directBlendSupply;
