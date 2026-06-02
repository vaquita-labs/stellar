import type { Abi } from '../../types';
import { supabase } from '../../lib/supabase';

const cache: { [key: string]: Abi } = {};

export const getABIByAddressByNetworkId = async (address: string, networkId: number) => {
  const key = `${address}_${networkId}`;
  if (cache[key]) {
    return cache[key];
  }
  const { error, data } = await supabase
    .from('contracts')
    .select('*')
    .eq('address', address)
    .eq('network_id', networkId)
    .maybeSingle();

  if (error) {
    console.error('Error on getABIByAddressByNetworkId', { address, networkId }, error);
  }
  if (data?.abi) {
    cache[key] = data?.abi as Abi;
  }

  return (cache[key] || []) as Abi;
};
