import { supabase } from '../../lib/supabase';
import type { Network, Token, TokenNetwork } from '../../types';

export const getNetworkById = async (id: number) => {
  const { data, ...rest } = await supabase
    .from('networks')
    .select(`
      *,
      tokens_networks (
        *,
        tokens (*)
      )
    `)
    .eq('id', id)
    .maybeSingle();

  return {
    data: data as Network | null,
    ...rest,
  };
};

export const getNetworkByName = async (networkName: string) => {
  const { data, ...rest } = await supabase
    .from('networks')
    .select(`
      *,
      tokens_networks (
        *,
        tokens (*)
      )
    `)
    .eq('name', networkName)
    .maybeSingle();

  return {
    data: data as Network | null,
    ...rest,
  };
};

export const getTokenBySymbol = async (networkSymbol: string) => {
  const { data, ...rest } = await supabase
    .from('tokens')
    .select('*')
    .eq('symbol', networkSymbol)
    .maybeSingle();

  return {
    data: data as Token | null,
    ...rest,
  };
};

export const getTokenNetworkByNetworkIdTokenId = async (networkId: number, tokenId: number) => {
  const { data, ...rest } = await supabase
    .from('tokens_networks')
    .select('*, tokens (*)')
    .eq('network_id', networkId)
    .eq('token_id', tokenId)
    .maybeSingle();
  return {
    data: data as TokenNetwork | null,
    ...rest,
  };
};

export const getTokenNetworkByContractAddressAndNetworkId = async (contractAddress: string, networkId: number) => {
  const { data, ...rest } = await supabase
    .from('tokens_networks')
    .select('*, tokens (*)')
    .eq('contract_address', contractAddress)
    .eq('network_id', networkId)
    .maybeSingle();
  return {
    data: data as TokenNetwork | null,
    ...rest,
  };
};
