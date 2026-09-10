import { isPassiveVaultEnabled } from '@/core-ui/config/featureFlags';
import {
  recordVaultFlowInBackground,
  type VaultDepositFlowKind,
  type VaultWithdrawFlowKind,
} from '@/networks/pollar/vaultFlowsApi';
import { directBlendSupply, directBlendWithdraw } from './blendDirect';
import { invokeViaPollar, requirePollarClient, toBaseUnits } from './sorobanTx';
import {
  applySlippageFloor,
  formatBaseUnits,
  getDefindexVaultConfig,
  getVaultShares,
  getVaultTotals,
  getVaultUsdcForShares,
  usdcToShares,
  WITHDRAW_SLIPPAGE_BPS,
  type DefindexVaultConfig,
} from './vaultQueries';
import { parseVaultError } from './vaultError';

export interface PassiveDepositInput {
  address: string;
  amount: string;
  decimals: number;
}

export interface PassiveWithdrawInput extends PassiveDepositInput {
  /** Withdraw the entire position (ignores `amount`). */
  withdrawAll?: boolean;
}

/**
 * What the routers need on top of a low-level call: which side of Vaquita's
 * boundary the money crossed.
 *
 * Required, and split by direction so a deposit cannot be filed as an outflow.
 * Nothing about a `deposit` call tells the server whether the user added money
 * or moved it over from a locked position, and that difference decides both the
 * volume figures and whether the deposit pays coins — so the tenth call site
 * added next quarter must not compile until somebody states its kind.
 */
export interface PassiveDepositFlowInput extends PassiveDepositInput {
  flowKind: VaultDepositFlowKind;
}

export interface PassiveWithdrawFlowInput extends PassiveWithdrawInput {
  flowKind: VaultWithdrawFlowKind;
}

/**
 * Vuelve a tirar un rechazo del vault como `VaultContractError`, que lleva el
 * código adentro. Antes acá se tiraba un `Error` con la frase traducida y el
 * código se perdía: `humanizeTxError` matchea contra el `Error(Contract, #N)`
 * literal, así que sin él todos los rechazos del vault —el #451 del polvo entre
 * ellos— caían en el genérico y el usuario nunca se enteraba de por qué.
 */
const rethrowVaultError = (e: unknown): never => {
  throw parseVaultError(e) ?? (e as Error);
};

/**
 * Deposit USDC into the Vaquita DeFindex vault.
 *
 * Single-asset vault, so `amounts_min == amounts_desired` (a single-asset vault
 * always takes the full amount, so a deposit slippage tolerance would only lose
 * money for nothing), and `invest: true` puts the funds to work immediately. The
 * user is `from` and signs via Pollar, whose signature also authorizes the nested
 * USDC transfer — so there's no separate `approve` step. Recognized vault
 * contract errors are translated to a readable message before rethrowing.
 */
export const vaultDeposit = async ({
  address,
  amount,
  decimals,
}: PassiveDepositInput): Promise<{ hash: string }> => {
  const config = getDefindexVaultConfig();
  if (!config) throw new Error('DeFindex vault is not configured for this token');
  if (!address) throw new Error('No connected address');

  const raw = toBaseUnits(amount, decimals);
  if (raw <= 0n) throw new Error('Amount must be greater than zero');
  const rawStr = raw.toString();

  try {
    return await invokeViaPollar(
      requirePollarClient(),
      {
        contractId: config.vaultId,
        method: 'deposit',
        // deposit(amounts_desired, amounts_min, from, invest)
        args: [
          { type: 'vec', value: [{ type: 'i128', value: rawStr }] },
          { type: 'vec', value: [{ type: 'i128', value: rawStr }] },
          { type: 'address', value: address },
          { type: 'bool', value: true },
        ],
      },
      'vaultDeposit',
    );
  } catch (e) {
    return rethrowVaultError(e);
  }
};

/** Low-level vault withdraw: burn `shares`, requiring at least `minOut` USDC out. */
const submitVaultWithdraw = async (
  config: DefindexVaultConfig,
  address: string,
  shares: bigint,
  minOut: bigint,
): Promise<{ hash: string }> => {
  try {
    return await invokeViaPollar(
      requirePollarClient(),
      {
        contractId: config.vaultId,
        method: 'withdraw',
        // withdraw(withdraw_shares, min_amounts_out, from)
        args: [
          { type: 'i128', value: shares.toString() },
          { type: 'vec', value: [{ type: 'i128', value: minOut.toString() }] },
          { type: 'address', value: address },
        ],
      },
      'vaultWithdraw',
    );
  } catch (e) {
    return rethrowVaultError(e);
  }
};

/**
 * Withdraw the entire vault position. Reads the user's full share balance FRESH
 * at execution (never a stale UI number) and burns exactly that, flooring the
 * expected USDC by the slippage margin for min_amounts_out.
 *
 * Returns the USDC it expects to move as well as the hash. The call arguments
 * cannot tell you: `withdrawAll` ignores whatever amount the UI asked for and
 * burns the live balance, so the figure the user sees on screen is not the one
 * that left the vault. `expected` is the vault's own valuation of those shares
 * at execution, which is the closest thing to a measured amount available
 * without a second on-chain read.
 */
export const vaultWithdrawAll = async ({
  address,
  decimals,
}: {
  address: string;
  decimals: number;
}): Promise<{ hash: string; amount: string }> => {
  const config = getDefindexVaultConfig();
  if (!config) throw new Error('DeFindex vault is not configured for this token');
  if (!address) throw new Error('No connected address');

  const shares = await getVaultShares(config, address);
  if (shares <= 0n) throw new Error('No vault balance to withdraw');

  const expected = await getVaultUsdcForShares(config, shares);
  const { hash } = await submitVaultWithdraw(
    config,
    address,
    shares,
    applySlippageFloor(expected, WITHDRAW_SLIPPAGE_BPS),
  );
  return { hash, amount: formatBaseUnits(expected, decimals) };
};

/**
 * Withdraw a specific USDC amount from the vault. Converts USDC→shares rounded
 * UP (`usdcToShares`) so the burn covers the amount asked for — flooring it left
 * the payout one base unit short and the fiat off-ramps, which hand the provider
 * an exact quoted amount, bounced on the difference. The result is capped at the
 * user's actual share balance, so the extra share can never over-request;
 * min_amounts_out is the requested USDC minus the slippage floor.
 */
export const vaultWithdrawUsdc = async ({
  address,
  amount,
  decimals,
}: PassiveDepositInput): Promise<{ hash: string }> => {
  const config = getDefindexVaultConfig();
  if (!config) throw new Error('DeFindex vault is not configured for this token');
  if (!address) throw new Error('No connected address');

  const usdcRaw = toBaseUnits(amount, decimals);
  if (usdcRaw <= 0n) throw new Error('Amount must be greater than zero');

  const { totalSupply, totalManaged } = await getVaultTotals(config);
  let shares = usdcToShares(usdcRaw, totalSupply, totalManaged);
  const balance = await getVaultShares(config, address);
  if (shares > balance) shares = balance;
  if (shares <= 0n) throw new Error('Amount is too small to withdraw');

  return submitVaultWithdraw(config, address, shares, applySlippageFloor(usdcRaw, WITHDRAW_SLIPPAGE_BPS));
};

/**
 * Passive deposit router: when the passive-vault flag is on AND the active token
 * has a DeFindex vault configured, deposit into the vault; otherwise fall back to
 * the legacy direct-to-Blend supply.
 *
 * It is also where the movement gets recorded, rather than at the call sites:
 * every UI path already goes through this one line, so a deposit cannot reach
 * the chain without also reaching the ledger.
 */
export const passiveDeposit = async ({
  flowKind,
  ...input
}: PassiveDepositFlowInput): Promise<{ hash: string }> => {
  const result =
    isPassiveVaultEnabled() && getDefindexVaultConfig() ? await vaultDeposit(input) : await directBlendSupply(input);
  // Recorded whichever backend served it: from the user's side both are the
  // same flexible product, and a ledger that skipped the legacy Blend path
  // would lose exactly the wallets that have not migrated yet.
  recordVaultFlowInBackground(input.address, {
    flowKind,
    amount: input.amount,
    transactionHash: result.hash,
  });
  return result;
};

/**
 * Passive withdraw router: when the passive-vault flag is on AND the active token
 * has a DeFindex vault configured, withdraw from the vault (all or a USDC amount);
 * otherwise fall back to the legacy direct-from-Blend withdraw.
 *
 * Returns the USDC that actually moved alongside the hash — see
 * `vaultWithdrawAll` for why the requested amount is not the same thing.
 */
export const passiveWithdraw = async ({
  flowKind,
  ...input
}: PassiveWithdrawFlowInput): Promise<{ hash: string; amount: string }> => {
  const result: { hash: string; amount?: string } = await (async () => {
    if (isPassiveVaultEnabled() && getDefindexVaultConfig()) {
      return input.withdrawAll
        ? vaultWithdrawAll({ address: input.address, decimals: input.decimals })
        : vaultWithdrawUsdc(input);
    }
    return directBlendWithdraw(input);
  })();

  // `withdrawAll` is the common path — the fiat modals and the deposit panel all
  // set it when the amount equals the balance — and it is the only one that
  // knows what actually moved, so the requested figure is the fallback, not the
  // default.
  const amount = result.amount || input.amount;
  recordVaultFlowInBackground(input.address, { flowKind, amount, transactionHash: result.hash });
  return { hash: result.hash, amount };
};
