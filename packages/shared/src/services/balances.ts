import * as StellarSdk from '@stellar/stellar-sdk';
import type { NetworkResponseDTO } from '../types';

const isStellarAddress = (address: string) =>
  StellarSdk.StrKey.isValidEd25519PublicKey(address);

const stellarServers: { [key: string]: any } = {
  ['Stellar Testnet']: new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org'),
  ['Stellar']: new StellarSdk.Horizon.Server('https://horizon.stellar.org'),
};

export async function getBalances(address: string, networks: NetworkResponseDTO[]) {
  
  const results: {
    networkName: string,
    balance: number,
    tokenSymbol: string
  }[] = [];
  
  for (const net of networks) {
    if (net.type === 'Stellar') {
      if (!isStellarAddress(address)) continue;
      try {
        const account = await stellarServers[net.name]?.loadAccount(address);
        for (const token of net.tokens) {
          if (!token.isSupported) continue;
          const match = account.balances.find((bal: any) => {
            const tokenSymbol = bal.asset_type === 'native' ? 'XLM' : bal.asset_code;
            return tokenSymbol === token.symbol;
          });
          results.push({
            networkName: net.name,
            balance: match ? Number(match.balance) * (10 ** token.decimals) : 0,
            tokenSymbol: token.symbol,
          });
        }
      } catch (error) {
        console.error(`error on getBalances with ${net.name}`, error);
      }
      continue;
    }
  }

  return results;
}
