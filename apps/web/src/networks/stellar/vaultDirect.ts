import { isPassiveVaultEnabled } from '@/core-ui/config/featureFlags';
import { directBlendSupply, directBlendWithdraw } from './blendDirect';
import { invokeViaPollar, requirePollarClient, toBaseUnits } from './sorobanTx';
import {
  applySlippageFloor,
  getDefindexVaultConfig,
  getVaultShares,
  getVaultTotals,
  getVaultUsdcForShares,
  parseVaultErrorMessage,
  usdcToShares,
  WITHDRAW_SLIPPAGE_BPS,
  type DefindexVaultConfig,
} from './vaultQueries';

export interface PassiveDepositInput {
  address: string;
  amount: string;
  decimals: number;
}

export interface PassiveWithdrawInput extends PassiveDepositInput {
  /** Withdraw the entire position (ignores `amount`). */
  withdrawAll?: boolean;
}

/** Map a recognized vault ContractError to a readable message, else rethrow. */
const rethrowVaultError = (e: unknown): never => {
  const friendly = parseVaultErrorMessage(e);
  throw friendly ? new Error(friendly) : (e as Error);
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
 */
export const vaultWithdrawAll = async ({ address }: { address: string }): Promise<{ hash: string }> => {
  const config = getDefindexVaultConfig();
  if (!config) throw new Error('DeFindex vault is not configured for this token');
  if (!address) throw new Error('No connected address');

  const shares = await getVaultShares(config, address);
  if (shares <= 0n) throw new Error('No vault balance to withdraw');

  const expected = await getVaultUsdcForShares(config, shares);
  return submitVaultWithdraw(config, address, shares, applySlippageFloor(expected, WITHDRAW_SLIPPAGE_BPS));
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
 * the legacy direct-to-Blend supply. Same signature as `directBlendSupply`, so
 * it's a drop-in at every passive deposit entry point.
 */
export const passiveDeposit = (input: PassiveDepositInput): Promise<{ hash: string }> =>
  isPassiveVaultEnabled() && getDefindexVaultConfig() ? vaultDeposit(input) : directBlendSupply(input);

/**
 * Passive withdraw router: when the passive-vault flag is on AND the active token
 * has a DeFindex vault configured, withdraw from the vault (all or a USDC amount);
 * otherwise fall back to the legacy direct-from-Blend withdraw. Same signature as
 * `directBlendWithdraw`, so it's a drop-in at every passive withdraw entry point.
 */
export const passiveWithdraw = (input: PassiveWithdrawInput): Promise<{ hash: string }> => {
  if (isPassiveVaultEnabled() && getDefindexVaultConfig()) {
    return input.withdrawAll
      ? vaultWithdrawAll({ address: input.address })
      : vaultWithdrawUsdc(input);
  }
  return directBlendWithdraw(input);
};
