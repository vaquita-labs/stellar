'use client';

import { Select, SelectItem } from '@heroui/react';
import { useNetworks } from '../../hooks';
import { useNetworkConfigStore } from '../../stores';
import Image from 'next/image';
import { T } from '../atoms/T';

const icons: { [key: string]: string } = {
  Base: '/chains/base_400x400.jpg',
  'Base Sepolia Testnet': '/chains/base_400x400.jpg',
  'Core Testnet 2': '/chains/core.png',
  Lisk: '/chains/lisk.png',
  Stellar: '/chains/stellar.png',
  'Stellar Testnet':'/chains/stellar.png',
  Dummy: '/assets/logo/logo-mobile.png',
  Bitcoin: '/chains/bitcoin.png'
}

export const NetworkSelector = () => {
  const {
    data: { networks, types },
  } = useNetworks();
  const userStore = useNetworkConfigStore();

  const { setNetwork, network } = userStore;

  if (networks.length === 1 || types.length === 0) {
    return null;
  }

  return (
    <Select
      aria-label="Select network"
      variant="bordered"
      selectedKeys={network?.name ? [network.name] : []}
      onSelectionChange={([value]) => {
        const network = networks.find(({ name }) => name === value);
        if (network) {
          setNetwork(network);
        }
      }}
      classNames={{
        trigger: 'border-black border-1 rounded-md',
        popoverContent: 'bg-white border-black border-1 rounded-md',
      }}
      className="w-36"
      renderValue={(selected) => {
        const network = networks.find(({ name }) => name === selected[0]?.key);
        if (network) {
          return (
            <div className="flex items-center gap-2 w-36">
              <Image src={icons[network?.name]} alt={network.name}  width={20} height={20} />
              <span className="truncate flex-1">{network.name}</span>
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
          <div className="flex items-center gap-2">
            <Image src={icons[network.name]} alt={network.name} className="w-5 h-5" width={20} height={20} />
            {network.name}
          </div>
        </SelectItem>
      ))}
    </Select>
  );
};
