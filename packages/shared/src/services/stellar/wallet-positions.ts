import { PoolV2 } from '@blend-capital/blend-sdk';
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

export interface WalletPositionConfig {
  /** Soroban RPC URL for the target network. */
  rpcUrl: string;
  /** Network passphrase (Networks.PUBLIC / TESTNET). */
  networkPassphrase: string;
  /** DeFindex vault contract (also the df-token whose balance is the position). */
  vaultId: string;
  /** Blend V2 pool that accepts USDC as reserve, or null if none configured. */
  blendPoolId: string | null;
  /** USDC SAC — the vault asset and the Blend reserve. */
  usdcId: string;
  /** Decimals of the underlying asset (USDC = 7). */
  decimals: number;
}

export interface WalletPositions {
  /** USDC supplied directly to Blend by this wallet (human units). */
  blendUsdc: number;
  /** USDC value of this wallet's DeFindex vault shares (human units). */
  vaultUsdc: number;
}

/** Simulate a read-only contract call and return the decoded return value. */
async function simulateRead(
  server: rpc.Server,
  networkPassphrase: string,
  contractId: string,
  method: string,
  ...args: xdr.ScVal[]
): Promise<unknown> {
  const account = new Account(Keypair.random().publicKey(), '0');
  const tx = new TransactionBuilder(account, { fee: '100', networkPassphrase })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`${method} simulation failed: ${sim.error}`);
  }
  return sim.result?.retval ? scValToNative(sim.result.retval) : null;
}

/** USDC value of a wallet's DeFindex vault shares (0 if it holds none). */
async function readVaultUsdc(server: rpc.Server, cfg: WalletPositionConfig, wallet: string): Promise<number> {
  if (!cfg.vaultId) return 0;
  const shares = (await simulateRead(
    server,
    cfg.networkPassphrase,
    cfg.vaultId,
    'balance',
    new Address(wallet).toScVal(),
  )) as bigint;
  if (!shares || shares <= 0n) return 0;
  const amounts = (await simulateRead(
    server,
    cfg.networkPassphrase,
    cfg.vaultId,
    'get_asset_amounts_per_shares',
    nativeToScVal(shares, { type: 'i128' }),
  )) as bigint[];
  const raw = Array.isArray(amounts) ? amounts[0] ?? 0n : 0n;
  return Number(raw) / 10 ** cfg.decimals;
}

/** USDC a wallet has supplied as collateral to the Blend pool (0 if none). */
async function readBlendUsdc(cfg: WalletPositionConfig, wallet: string): Promise<number> {
  if (!cfg.blendPoolId) return 0;
  const pool = await PoolV2.load({ rpc: cfg.rpcUrl, passphrase: cfg.networkPassphrase }, cfg.blendPoolId);
  const reserve = pool.reserves.get(cfg.usdcId);
  if (!reserve) return 0;
  const user = await pool.loadUser(wallet);
  const usdc = user.getCollateralFloat(reserve);
  return Number.isFinite(usdc) ? usdc : 0;
}

/**
 * Read a wallet's on-chain USDC positions in both the DeFindex vault (new passive)
 * and Blend (legacy direct supply), server-side. The caller supplies the RPC URL +
 * passphrase so this works from admin / api / web without coupling to any one env.
 *
 * Legitimately-empty positions read as 0 (a non-holder's df-token balance is 0, a
 * non-user's Blend collateral is 0); RPC/simulation failures THROW so a caller can
 * surface the error or back off (e.g. on a 429 during a batch scrape).
 */
export async function getWalletPositions(wallet: string, cfg: WalletPositionConfig): Promise<WalletPositions> {
  const server = new rpc.Server(cfg.rpcUrl, { allowHttp: cfg.rpcUrl.startsWith('http://') });
  const [vaultUsdc, blendUsdc] = await Promise.all([
    readVaultUsdc(server, cfg, wallet),
    readBlendUsdc(cfg, wallet),
  ]);
  return { vaultUsdc, blendUsdc };
}
