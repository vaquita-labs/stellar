import * as StellarSdk from '@stellar/stellar-sdk';
import { ethers, isAddress, JsonRpcProvider } from 'ethers';
import type { NetworkResponseDTO } from '../types';

// 🧠 ABI mínimo de ERC-20 (solo balanceOf y decimals)
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

const evmProviders: { [key: string]: JsonRpcProvider } = {
  // https://developer.metamask.io/key/active-endpoints
  Base: new ethers.JsonRpcProvider('https://base-mainnet.infura.io/v3/cc2eea3068bd4e7594bebcf9100d0aa1'),
  ['Base Sepolia Testnet']: new ethers.JsonRpcProvider('https://base-sepolia.infura.io/v3/cc2eea3068bd4e7594bebcf9100d0aa1'),
};

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
  
  if (!isAddress(address)) {
    return results;
  }
  for (const net of networks) {
    
    const provider = evmProviders[net.name]!;
    let balance = 0;
    for (const token of net.tokens) {
      if (token.isSupported) {
        try {
          if (net.type === 'Stellar') {
            const account = await stellarServers[net.name]?.loadAccount(address);
            for (const bal of account.balances) {
              const tokenSymbol = bal.asset_type === 'native' ? 'XLM' : `${bal.asset_code}`;
              if (tokenSymbol === token.symbol) {
                results.push({
                  networkName: net.name,
                  balance: Number(bal.balance) * (10 ** token.decimals),
                  tokenSymbol,
                });
              }
            }
            continue; // saltar al siguiente network
          } else if (net.type === 'EVM') {
            if (provider) {
              if (token.isNative) {
                const nativeWei = await provider.getBalance(address);
                balance = Number(ethers.formatEther(nativeWei)) * (10 ** token.decimals);
              } else {
                const contractAddress = token.contractAddress?.split(',')?.[0] ?? '';
                if (isAddress(contractAddress)) {
                  const usdcContract = new ethers.Contract(contractAddress, ERC20_ABI, provider);
                  const code = await provider.getCode(contractAddress);
                  
                  if (code !== '0x') {
                    balance = Number(await usdcContract.balanceOf?.(address) ?? 0);
                  } else {
                    console.warn(`No contract deployed at ${token.contractAddress} on ${net}`);
                  }
                } else {
                  console.info(`Invalid contract address: "${contractAddress}" for token ${token.name} on ${net.name}`);
                }
              }
            }
          }
          
        } catch (error) {
          console.error(`error on getBalances with ${net.name} and ${token.name}`, error);
        }
        
        results.push({
          networkName: net.name,
          balance,
          tokenSymbol: token.symbol,
        });
      }
    }
  }
  
  return results;
}
