import { firstElement } from '../../helpers';
import type { Network, NetworkResponseDTO } from '../../types';
import { getABIByAddressByNetworkId } from '../contracts';

export const toNetwork = async (network: Network): Promise<NetworkResponseDTO> => ({
  name: network.name,
  type: network.type,
  chainId: network.chain_id || -1,
  tokens: await Promise.all(network.tokens_networks.map(async tn => ({
    isGas: tn.is_gas,
    isNative: tn.is_native,
    isSupported: tn.is_supported,
    symbol: tn.tokens.symbol,
    name: tn.tokens.name,
    decimals: tn.token_decimals,
    lockPeriod: tn.lock_period?.split(',').map(period => +period).filter(period => !!period) ?? [],
    contractAddress: tn.contract_address?.split(',')?.[0] ?? '',
    contractAbi: await getABIByAddressByNetworkId(tn.contract_address, network.id),
    vaquitaContractAddress: firstElement(tn.vaquita_contract_address),
    vaquitaContractAbi: await getABIByAddressByNetworkId(firstElement(tn.vaquita_contract_address), network.id),
  }))),
});
