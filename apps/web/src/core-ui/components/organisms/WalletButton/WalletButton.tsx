'use client';

import { useState } from 'react';
import { truncateMiddle } from '../../../helpers';
import { useConfigStore } from '../../../stores';
import { Button } from '../../atoms/Button';
import { ProfileModal } from './ProfileModal';

interface WalletButtonProps {
  handleLogout?: () => Promise<void> | void;
  startContentSrc: string;
  startContentAlt: string;
}

export function WalletButton({ handleLogout }: WalletButtonProps) {
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const walletAddress = useConfigStore((store) => store.walletAddress);

  if (!walletAddress) {
    return null;
  }

  return (
    <>
      <Button onPress={() => setShowLogoutModal(true)} className="px-5 m-2 rounded-md w-full bg-primary border border-black border-b-3 text-black text-sm font-semibold hover:bg-primary/80 transition shadow-sm">{truncateMiddle(walletAddress)}</Button>
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
