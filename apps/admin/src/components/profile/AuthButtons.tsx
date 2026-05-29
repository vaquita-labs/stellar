'use client';

import { DummyAuthButtons, NetworkSelector } from '@/core-ui/components';
import { isEvmType } from '@/core-ui/helpers';
import { useNetworks } from '@/core-ui/hooks';
import { useNetworkConfigStore } from '@/core-ui/stores';
import { isDummyNetwork } from '@/networks/dummy';
import { isEvmTypeNetwork } from '@/networks/evm';
import PrivyAuthButtons from './PrivyAuthButtons';

export const AuthButtons = () => {
  const { network } = useNetworkConfigStore();
  const { data: { types } = { types: [] } } = useNetworks();

  return (
    <div className="absolute top-2 left-20 right-0">
      <div className="flex justify-end gap-2 p-2 w-full bg-transparent">
        <NetworkSelector />
        {network && (isEvmType(types).isUnique || isEvmTypeNetwork(network.name)) && <PrivyAuthButtons />}
        {isDummyNetwork() && <DummyAuthButtons />}
      </div>
    </div>
  );
};
