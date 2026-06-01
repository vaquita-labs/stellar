'use client';

import { Button } from '@heroui/react';
import { useState } from 'react';
import { truncateMiddle } from '../../../helpers';
import { useNetworkConfigStore } from '../../../stores';
import { ProfileModal } from './ProfileModal';

interface WalletButtonProps {
  handleLogout?: () => Promise<void> | void;
  startContentSrc: string;
  startContentAlt: string;
}

export function WalletButton({ handleLogout }: WalletButtonProps) {
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const { walletAddress } = useNetworkConfigStore();
  if (!walletAddress) {
    return null;
  }
  return (
    <>
      <Button
        onPress={() => setShowLogoutModal(true)}
        className="px-4 py-5 flex gap-2 rounded-md w-full bg-transparent m-2 border border-black border-b-3 text-black text-sm font-semibold hover:bg-primary transition shadow-sm"
      >
        {truncateMiddle(walletAddress)}
      </Button>
      <ProfileModal
        handleLogout={
          handleLogout
            ? async () => {
                await handleLogout();
                setShowLogoutModal(false);
              }
            : undefined
        }
        isOpen={showLogoutModal}
        onOpenChange={setShowLogoutModal}
        walletAddress={walletAddress}
      />
    </>
  );
}
