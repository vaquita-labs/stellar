import { Horizon, Keypair, Networks, Transaction } from '@stellar/stellar-sdk';
import type { Signer } from './fixtures';

/**
 * Testnet USDC for the deposit/withdraw specs.
 *
 * The Vaquita testnet pool accepts the USDC issued by Blend's testnet issuer
 * (`GATALT…`, the `issuer` the API reports in `GET /api/v1/config`). Blend runs
 * a faucet for it: `GET …/getAssets?userId=<G…>` answers with a transaction the
 * issuer already signed that adds the trustlines and pays 1000 USDC (plus BLND,
 * wETH and wBTC) to the account; the account co-signs and submits it. No
 * captcha, so CI can top the wallet up on its own.
 */

const HORIZON = 'https://horizon-testnet.stellar.org';
const FAUCET = 'https://ewqw4hx7oa.execute-api.us-east-1.amazonaws.com/getAssets';

export const TESTNET_USDC_ISSUER = 'GATALTGTWIOT6BUDBCZM3Q4OQ4BO2COLOAZ7IYSKPLC2PMSOPPGF5V56';

export async function usdcBalance(publicKey: string): Promise<number> {
  const account = await new Horizon.Server(HORIZON).loadAccount(publicKey);
  const line = account.balances.find(
    (b) => 'asset_code' in b && b.asset_code === 'USDC' && 'asset_issuer' in b && b.asset_issuer === TESTNET_USDC_ISSUER,
  );
  return line ? Number(line.balance) : 0;
}

export async function requestFaucet(signer: Signer): Promise<string> {
  const res = await fetch(`${FAUCET}?userId=${encodeURIComponent(signer.publicKey)}`);
  if (!res.ok) throw new Error(`Blend faucet answered ${res.status}: ${await res.text()}`);
  const tx = new Transaction(await res.text(), Networks.TESTNET);
  tx.sign(Keypair.fromSecret(signer.secret));
  const result = await new Horizon.Server(HORIZON).submitTransaction(tx);
  return result.hash;
}

/**
 * Make sure the wallet holds at least `minimum` pool USDC, topping it up from
 * the faucet when it does not. Returns the balance it ended up with; callers
 * skip their spec (rather than fail) when even that is short, e.g. the faucet
 * being down.
 */
export async function ensureTestnetUsdc(signer: Signer, minimum: number): Promise<number> {
  let balance = await usdcBalance(signer.publicKey);
  if (balance >= minimum) return balance;
  try {
    await requestFaucet(signer);
    balance = await usdcBalance(signer.publicKey);
  } catch (error) {
    console.warn(`[e2e] could not top up testnet USDC for ${signer.publicKey}:`, error);
  }
  return balance;
}
