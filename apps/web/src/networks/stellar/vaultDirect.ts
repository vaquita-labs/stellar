import { isPassiveVaultEnabled } from '@/core-ui/config/featureFlags';
import { directBlendSupply } from './blendDirect';
import { invokeViaPollar, requirePollarClient, toBaseUnits } from './sorobanTx';
import { getDefindexVaultConfig, parseVaultErrorMessage } from './vaultQueries';

export interface PassiveDepositInput {
  address: string;
  amount: string;
  decimals: number;
}

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
    const friendly = parseVaultErrorMessage(e);
    throw friendly ? new Error(friendly) : (e as Error);
  }
};

/**
 * Passive deposit router: when the passive-vault flag is on AND the active token
 * has a DeFindex vault configured, deposit into the vault; otherwise fall back to
 * the legacy direct-to-Blend supply. Same signature as `directBlendSupply`, so
 * it's a drop-in at every passive deposit entry point.
 */
export const passiveDeposit = (input: PassiveDepositInput): Promise<{ hash: string }> =>
  isPassiveVaultEnabled() && getDefindexVaultConfig() ? vaultDeposit(input) : directBlendSupply(input);
