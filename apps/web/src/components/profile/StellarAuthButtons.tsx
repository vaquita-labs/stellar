'use client';

import { WalletButton } from '@/core-ui/components';
import { useConfigStore } from '@/core-ui/stores';
import { isStellarNetwork } from '@/networks/stellar';
import { PollarLoginButton } from '@/networks/stellar/wallet/PollarLoginButton';
import { pollarAdapter } from '@/networks/stellar/wallet/adapters/pollar-adapter';
import { setActiveAdapter } from '@/networks/stellar/wallet/registry';

export default function StellarAuthButtons() {
  const walletAddress = useConfigStore().walletAddress;
  const network = useConfigStore((store) => store.network);

  const isStellarNet = network ? isStellarNetwork(network.networkName) : false;
  const isConnected = !!walletAddress && isStellarNet;

  const handleLogout = async () => {
    await pollarAdapter.disconnect();
    setActiveAdapter(null);
    useConfigStore.getState().setWalletAddress('');
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
