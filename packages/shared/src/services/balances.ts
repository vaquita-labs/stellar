import * as StellarSdk from '@stellar/stellar-sdk';
import type { ProjectConfigResponseDTO } from '../types';

const isStellarAddress = (address: string) =>
  StellarSdk.StrKey.isValidEd25519PublicKey(address);

const stellarServers: { [key: string]: any } = {
  ['Stellar Testnet']: new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org'),
  ['Stellar']: new StellarSdk.Horizon.Server('https://horizon.stellar.org'),
};

export async function getBalances(address: string, config: ProjectConfigResponseDTO | null) {

  const results: {
    networkName: string,
    balance: number,
    tokenSymbol: string
  }[] = [];

  if (!config) return results;

  // Single-network: the app is Stellar-only. The config has no `type` column, so
  // the network is identified by name — the keys here match the supported Horizon
  // hosts, preserving the previous `stellarServers[net.name]` behaviour.
  const server = stellarServers[config.networkName];
  if (!server) return results;
  if (!isStellarAddress(address)) return results;

  try {
    const account = await server.loadAccount(address);
    for (const token of config.tokens) {
      if (!token.isSupported) continue;
      const match = account.balances.find((bal: any) => {
        const tokenSymbol = bal.asset_type === 'native' ? 'XLM' : bal.asset_code;
        return tokenSymbol === token.symbol;
      });
      results.push({
        networkName: config.networkName,
        balance: match ? Number(match.balance) * (10 ** token.decimals) : 0,
        tokenSymbol: token.symbol,
      });
    }
  } catch (error) {
    console.error(`error on getBalances with ${config.networkName}`, error);
  }

  return results;
}
