'use client';

import { useNetworkConfigStore } from '../../stores';
import { ConnectButton } from '../atoms';
import { WalletButton } from './WalletButton';

export function DummyAuthButtons() {
  const { walletAddress, setWalletAddress } = useNetworkConfigStore();

  return (
    <div className="flex items-center gap-4">
      <WalletButton
        handleLogout={() => setWalletAddress('')}
        startContentSrc="/vaquita_working.jpg"
        startContentAlt="Dummy"
      />
      {!walletAddress && (
        <ConnectButton
          onPress={() => setWalletAddress('0xDummy...wallet')}
          startContentSrc="/vaquita_working.jpg"
          startContentAlt="Dummy"
        />
      )}
    </div>
  );
}
