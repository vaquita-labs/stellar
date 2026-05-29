'use client';

import { ConnectButton, T, WalletButton } from '@/core-ui/components';
import { useNetworks } from '@/core-ui/hooks';
import { useNetworkConfigStore } from '@/core-ui/stores';
import { isEvmTypeNetwork } from '@/networks/evm';
import { Select, SelectItem } from '@heroui/react';
import { usePrivy } from '@privy-io/react-auth';

const icons: { [key: string]: string } = {
  Base: '/chains/base_400x400.jpg',
  'Base Sepolia Testnet': '/chains/base_400x400.jpg',
  'Core Testnet 2': '/chains/core.png',
  Lisk: '/chains/lisk.png',
};

export default function PrivyAuthButtons() {
  const { login, logout, user, ready } = usePrivy();
  const { data: { networks } = { networks: [] } } = useNetworks();
  const { network, setNetwork } = useNetworkConfigStore();
  const handleLogout = async () => {
    await logout();
  };

  if (!ready && network?.name) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <svg
          className="animate-spin h-4 w-4 text-[#FF9B00]"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        Loading wallet...
      </div>
    );
  }

  const types = new Set(networks.map((network) => network.type));

  if (network?.name && !isEvmTypeNetwork(network?.name)) {
    return null;
  }

  return (
    <div className="flex items-center gap-1">
      {user ? (
        <>
          {types.size === 1 && networks.length > 0 && (
            <Select
              aria-label="Select EVM network"
              className="min-w-38 border-none"
              variant="bordered"
              classNames={{
                trigger: 'border-black border-1 rounded-lg',
                popoverContent: 'bg-white border-black border-1 rounded-lg',
              }}
              selectedKeys={network?.name ? [network?.name] : []}
              onSelectionChange={([value]) => {
                const network = networks.find(({ name }) => name === value);
                if (network) {
                  setNetwork(network);
                }
              }}
              placeholder="Select a network..."
              renderValue={(selected) => {
                const network = networks.find(({ name }) => name === selected[0]?.key);
                if (network) {
                  return (
                    <div className="flex items-center gap-2">
                      <img src={icons[network?.name]} alt={network.name} className="w-5 h-5" />
                      <span>{network.name}</span>
                    </div>
                  );
                }
                return (
                  <div className="flex items-center gap-2">
                    <T>Select a network</T>
                  </div>
                );
              }}
            >
              {networks.map((network) => (
                <SelectItem key={network.name}>
                  <div className="flex items-center gap-2 ">
                    <img src={icons[network.name]} alt={network.name} className="w-5 h-5" />
                    <span>{network.name}</span>
                  </div>
                </SelectItem>
              ))}
            </Select>
          )}
          <WalletButton handleLogout={handleLogout} startContentSrc="/chains/evm.png" startContentAlt="EVM" />
        </>
      ) : (
        <ConnectButton onPress={() => login()} startContentSrc="/chains/evm.png" startContentAlt="EVM" />
      )}
    </div>
  );
}
