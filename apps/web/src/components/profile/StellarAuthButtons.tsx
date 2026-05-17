'use client';

import { WalletButton } from '@/core-ui/components';
import { useNetworkConfigStore } from '@/core-ui/stores';
import { isStellarNetwork } from '@/networks/stellar';
import { PollarLoginButton } from '@/networks/stellar/wallet/PollarLoginButton';
import { pollarAdapter } from '@/networks/stellar/wallet/adapters/pollar-adapter';
import { setActiveAdapter } from '@/networks/stellar/wallet/registry';

export default function StellarAuthButtons() {
  const walletAddress = useNetworkConfigStore().walletAddress;
  const network = useNetworkConfigStore((store) => store.network);

  const isStellarNet = network ? isStellarNetwork(network.name) : false;
  const isConnected = !!walletAddress && isStellarNet;

  const handleLogout = async () => {
    await pollarAdapter.disconnect();
    setActiveAdapter(null);
    useNetworkConfigStore.getState().setWalletAddress('');
  };

  return (
    <div className="flex items-center gap-2 w-full">
      {isConnected ? (
        <WalletButton handleLogout={handleLogout} startContentSrc="/chains/stellar.png" startContentAlt="Stellar" />
      ) : (
        <div className="flex flex-col items-stretch gap-2 w-full">
          <PollarLoginButton />
        </div>
      )}
    </div>
  );
}
