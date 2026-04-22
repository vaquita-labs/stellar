'use client';

import { useState } from 'react';
import { truncateMiddle } from '../../../helpers';
import { useNetworkConfigStore } from '../../../stores';
import { Button } from '../../atoms/Button';
import { ProfileModal } from './ProfileModal';

interface WalletButtonProps {
  handleLogout?: () => Promise<void> | void;
  startContentSrc: string;
  startContentAlt: string;
}

export function WalletButton({ handleLogout }: WalletButtonProps) {
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const walletAddress = useNetworkConfigStore((store) => store.walletAddress);

  if (!walletAddress) {
    return null;
  }

  return (
    <>
      <Button onPress={() => setShowLogoutModal(true)}>{truncateMiddle(walletAddress)}</Button>
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
