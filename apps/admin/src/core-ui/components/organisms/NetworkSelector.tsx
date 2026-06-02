'use client';

import { ListBox, Select } from '@heroui/react';
import Image from 'next/image';
import { useNetworks } from '../../hooks';
import { useNetworkConfigStore } from '../../stores';
import { T } from '../atoms/T';

const icons: { [key: string]: string } = {
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
      className="w-36 flex items-center justify-center"
      value={network?.name ?? null}
      onChange={(value) => {
        const net = networks.find(({ name }) => name === value);
        if (net) setNetwork(net);
      }}
    >
      <Select.Trigger className="border-black border rounded-md">
        <Select.Value>
          {({ isPlaceholder, state }) => {
            const selected = state?.selectedItem;
            const net = selected ? networks.find(({ name }) => name === String(selected.key)) : null;
            if (net) {
              return (
                <div className="flex items-center gap-2">
                  <Image src={icons[net.name]} alt={net.name} width={20} height={20} />
                  <span className="truncate flex-1">{net.name}</span>
                </div>
              );
            }
            return <div className="flex items-center gap-2"><T>Select a network</T></div>;
          }}
        </Select.Value>
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover className="bg-white border-black border rounded-md">
        <ListBox>
          {networks.map((net) => (
            <ListBox.Item key={net.name} id={net.name} textValue={net.name}>
              <div className="flex items-center gap-2">
                <Image src={icons[net.name]} alt={net.name} className="w-5 h-5" width={20} height={20} />
                {net.name}
              </div>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
};
