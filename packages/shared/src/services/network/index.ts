import { supabase } from '../../lib/supabase';
import type { Network, NetworkResponseDTO, Token, TokenNetwork } from '../../types';
import { toNetwork } from './helpers';

export const listenNetworksChanges = async (onChange: () => void) => {
  await supabase.realtime.setAuth();
  supabase
    .channel(`table:networks`, {
      config: { private: true },
    })
    .on('broadcast', { event: '*' }, () => {
      onChange();
    })
    .subscribe((status) => {
      console.info('Estado canal networks:', status);
    });
};

export const listenTokensChanges = async (onChange: () => void) => {
  await supabase.realtime.setAuth();
  supabase
    .channel(`table:tokens`, {
      config: { private: true },
    })
    .on('broadcast', { event: '*' }, () => {
      onChange();
    })
    .subscribe((status) => {
      console.info('Estado canal tokens:', status);
    });
};

export const listenTokensNetworksChanges = async (onChange: () => void) => {
  await supabase.realtime.setAuth();
  supabase
    .channel(`table:tokens_networks`, {
      config: { private: true },
    })
    .on('broadcast', { event: '*' }, () => {
      onChange();
    })
    .subscribe((status) => {
      console.info('Estado canal tokens_networks:', status);
    });
};

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

export const getNetworks = async () => {
  const { data, ...rest } = await supabase
    .from('networks')
    .select(`
      *,
      tokens_networks (
        *,
        tokens (*)
      )
    `);
  return {
    data: (data || []) as Network[],
    ...rest,
  };
};

export const getNetworksByOrigin = async (origin: string) => {
  const { data: networks, error } = await getNetworks();

  if (error) {
    console.error(error);
    return [] as NetworkResponseDTO[];
  }

  const filteredNetworks = networks.filter(net =>
    net.origins?.split(',').map(h => h.trim()).includes(origin),
  ).sort((a, b) => (a.order || 100) - (b.order || 100));
  return await Promise.all(filteredNetworks.map(toNetwork));
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
