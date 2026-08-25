import { nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { getComputedDepositId, getIsPoolPaused, parsePoolErrorMessage } from '../poolQueries';
import { buildDepositArgs, buildWithdrawArgs, toBaseUnits } from '../sorobanTx';
import { readTransferCredit } from '../txCredit';
import {
  derivePositionIdHex,
  ensureFunded,
  integrationEnv,
  invokeOnTestnet,
  simulateInvoke,
  simulateView,
  TESTNET_DEFAULTS,
  tokenBalance,
} from './testnet';

/**
 * VaquitaPool on Soroban testnet, driven through the frontend's own payload
 * builders (`buildDepositArgs` / `buildWithdrawArgs`) and read back through the
 * frontend's own queries (`getComputedDepositId`, `readTransferCredit`,
 * `parsePoolErrorMessage`). Every test skips, with a note, unless
 * `INTEGRATION_STELLAR_SECRET` names a funded testnet key.
 */

type Position = {
  owner: string;
  token: string;
  amount: bigint;
  shares: bigint;
  finalization_time: bigint;
  lock_period: bigint;
};

const LOCK_PERIOD = TESTNET_DEFAULTS.lockPeriod;
const HUMAN_AMOUNT = '1';
const AMOUNT = toBaseUnits(HUMAN_AMOUNT, TESTNET_DEFAULTS.tokenDecimals);

const positionIdScVal = (hex: string) => xdr.ScVal.scvBytes(Buffer.from(hex, 'hex'));

const getPosition = async (rpcUrl: string, poolId: string, idHex: string) =>
  (await simulateView(rpcUrl, poolId, 'get_position', positionIdScVal(idHex))) as Position | null | undefined;

/** Fresh u64 per run so re-runs never collide with a position left behind by an aborted run. */
const freshNonce = () => BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));

describe('VaquitaPool testnet — read paths', () => {
  it('exposes a versioned, unpaused pool', async (ctx) => {
    const env = integrationEnv(ctx);
    if (!env) return;

    const version = await simulateView(env.rpcUrl, env.poolContractId, 'version');
    expect(Number(version)).toBeGreaterThanOrEqual(1);
    await expect(getIsPoolPaused(env.poolContractId)).resolves.toBe(false);
  });

  it('supports the lock period the app deposits into', async (ctx) => {
    const env = integrationEnv(ctx);
    if (!env) return;

    const period = (await simulateView(
      env.rpcUrl,
      env.poolContractId,
      'get_period_data',
      nativeToScVal(LOCK_PERIOD, { type: 'u64' }),
    )) as { reward_pool: bigint; total_deposits: bigint } | null | undefined;
    // The period row only exists once something was deposited into it; either way
    // the app's default period must not be rejected by `deposit`.
    if (period) {
      expect(typeof period.reward_pool).toBe('bigint');
      expect(typeof period.total_deposits).toBe('bigint');
    }

    const unsupported = await simulateInvoke(
      env.rpcUrl,
      env.address,
      buildDepositArgs({ address: env.address, contractId: env.poolContractId, nonce: 1n, humanAmount: '1', period: 1n }),
    );
    expect(unsupported.ok).toBe(false);
    if (!unsupported.ok) {
      expect(unsupported.error).toMatch(/Error\(Contract, #4\)/);
      expect(parsePoolErrorMessage(new Error(unsupported.error))).toBe('Lock period not supported');
    }
  });

  it('derives the position id the same way the contract does', async (ctx) => {
    const env = integrationEnv(ctx);
    if (!env) return;

    const nonce = freshNonce();
    const onChain = await getComputedDepositId(env.poolContractId, env.address, nonce);
    expect(onChain).toBe(derivePositionIdHex(env.address, nonce));
  });

  it('reports an unknown nonce as "position not found" through the app error mapping', async (ctx) => {
    const env = integrationEnv(ctx);
    if (!env) return;

    const nonce = freshNonce();
    const idHex = derivePositionIdHex(env.address, nonce);
    await expect(getPosition(env.rpcUrl, env.poolContractId, idHex)).resolves.toBeFalsy();

    const sim = await simulateInvoke(
      env.rpcUrl,
      env.address,
      buildWithdrawArgs({ address: env.address, contractId: env.poolContractId, nonce }),
    );
    expect(sim.ok).toBe(false);
    if (!sim.ok) {
      expect(sim.error).toMatch(/Error\(Contract, #5\)/);
      expect(parsePoolErrorMessage(new Error(sim.error))).toBe('Position not found');
    }
  });
});

describe('VaquitaPool testnet — deposit / withdraw round trip', () => {
  it('deposits, reads the position back by nonce, and withdraws the principal', async (ctx) => {
    const env = integrationEnv(ctx);
    if (!env) return;

    let balance: bigint;
    try {
      balance = await ensureFunded(env, AMOUNT);
    } catch (err) {
      ctx.skip(`could not fund ${env.address} with the pool token: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    if (balance < AMOUNT) {
      ctx.skip(
        `${env.address} holds ${balance} base units of ${env.tokenContractId}; ` +
          `send it at least ${AMOUNT} (${HUMAN_AMOUNT} USDC) to run the deposit round trip`,
      );
      return;
    }

    const nonce = freshNonce();
    const idHex = derivePositionIdHex(env.address, nonce);

    // deposit(caller, nonce, amount, period) — exactly what the app hands Pollar.
    const deposit = await invokeOnTestnet(
      env,
      buildDepositArgs({
        address: env.address,
        contractId: env.poolContractId,
        nonce,
        humanAmount: HUMAN_AMOUNT,
        period: LOCK_PERIOD,
        tokenDecimals: TESTNET_DEFAULTS.tokenDecimals,
      }),
    );
    console.info('[integration] deposit tx', deposit.hash);

    // The pool pulled exactly the deposited amount from the caller.
    await expect(readTransferCredit(deposit.hash, env.tokenContractId, env.poolContractId)).resolves.toBe(AMOUNT);

    // Position lookup by the id the frontend computes from (caller, nonce).
    const computedId = await getComputedDepositId(env.poolContractId, env.address, nonce);
    expect(computedId).toBe(idHex);
    const position = await getPosition(env.rpcUrl, env.poolContractId, idHex);
    expect(position).toBeTruthy();
    expect(position?.owner).toBe(env.address);
    expect(position?.token).toBe(env.tokenContractId);
    expect(position?.amount).toBe(AMOUNT);
    expect(position?.shares).toBeGreaterThan(0n);
    expect(position?.lock_period).toBe(LOCK_PERIOD);
    const nowSecs = BigInt(Math.floor(Date.now() / 1000));
    expect(position!.finalization_time - nowSecs).toBeGreaterThan(LOCK_PERIOD - 600n);
    expect(position!.finalization_time - nowSecs).toBeLessThanOrEqual(LOCK_PERIOD + 600n);

    // A second deposit under the same nonce must be refused (#3) — the id is taken.
    const duplicate = await simulateInvoke(
      env.rpcUrl,
      env.address,
      buildDepositArgs({ address: env.address, contractId: env.poolContractId, nonce, amount: AMOUNT, period: LOCK_PERIOD }),
    );
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(parsePoolErrorMessage(new Error(duplicate.error))).toBe('Deposit ID already exists');

    // withdraw(caller, nonce) before maturity: principal comes back, interest (if any) stays.
    const withdraw = await invokeOnTestnet(
      env,
      buildWithdrawArgs({ address: env.address, contractId: env.poolContractId, nonce }),
    );
    console.info('[integration] withdraw tx', withdraw.hash);

    await expect(readTransferCredit(withdraw.hash, env.tokenContractId, env.address)).resolves.toBe(AMOUNT);
    await expect(getPosition(env.rpcUrl, env.poolContractId, idHex)).resolves.toBeFalsy();
    await expect(tokenBalance(env.rpcUrl, env.tokenContractId, env.address)).resolves.toBe(balance);

    // Withdrawing again is the "not found" path the UI maps for a closed position.
    const again = await simulateInvoke(
      env.rpcUrl,
      env.address,
      buildWithdrawArgs({ address: env.address, contractId: env.poolContractId, nonce }),
    );
    expect(again.ok).toBe(false);
    if (!again.ok) expect(parsePoolErrorMessage(new Error(again.error))).toBe('Position not found');
  });

  it('never opens a position for a caller the signer does not control', async (ctx) => {
    const env = integrationEnv(ctx);
    if (!env) return;

    // Args name a caller other than the signing account. `require_auth_for_args`
    // demands that caller's signature, which the integration key cannot give, so
    // the call is refused (at simulation or on-chain) and no position appears.
    const stranger = 'GDFF477UQUWOFIHSOEXPPOD5GPUSEW6OLGZB5FCPS6AFRAOPTMINA55X';
    const nonce = freshNonce();
    await expect(
      invokeOnTestnet(
        env,
        buildDepositArgs({ address: stranger, contractId: env.poolContractId, nonce, amount: AMOUNT, period: LOCK_PERIOD }),
      ),
    ).rejects.toThrow();
    await expect(getPosition(env.rpcUrl, env.poolContractId, derivePositionIdHex(stranger, nonce))).resolves.toBeFalsy();
  });
});
