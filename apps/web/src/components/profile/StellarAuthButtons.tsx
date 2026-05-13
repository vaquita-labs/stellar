'use client';

import { ConnectButton, WalletButton } from '@/core-ui/components';
import { useNetworkConfigStore } from '@/core-ui/stores';
import { isStellarNetwork, stellarSession } from '@/networks/stellar';
import { PollarLoginButton } from '@/networks/stellar/wallet/PollarLoginButton';
import { getActiveAdapter } from '@/networks/stellar/wallet/registry';

export default function StellarAuthButtons() {
  const { connect, logout } = stellarSession();
  const walletAddress = useNetworkConfigStore().walletAddress;
  const network = useNetworkConfigStore((store) => store.network);

  const isStellarNet = network ? isStellarNetwork(network.name) : false;
  const isConnected = !!walletAddress && isStellarNet;

  const handleConnect = async () => {
    try {
      await connect();
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    }
  };

  const handleLogout = async () => {
    const active = getActiveAdapter();
    if (active?.id === 'pollar') {
      await active.disconnect();
      useNetworkConfigStore.getState().setWalletAddress('');
      return;
    }
    await logout();
  };

  return (
    <div className="flex items-center gap-2 w-full">
      {isConnected ? (
        <WalletButton handleLogout={handleLogout} startContentSrc="/chains/stellar.png" startContentAlt="Stellar" />
      ) : (
        <div className="flex flex-col items-stretch gap-2 w-full">
          {/* <ConnectButton onPress={handleConnect} startContentSrc="/chains/stellar.png" startContentAlt="Stellar" /> */}
          <PollarLoginButton />
        </div>
      )}
    </div>
  );
}
