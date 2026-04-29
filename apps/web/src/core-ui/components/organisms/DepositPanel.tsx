'use client';

import { isEvmTypeNetwork } from '@/networks/evm';
import { Button as HeroButton } from '@heroui/react';
import { useState } from 'react';
import { useAnalytics } from '../../hooks';
import { useMapStore, useNetworkConfigStore } from '../../stores';
import { T } from '../atoms';
import { DepositModal } from './DepositModal';
import { VaquitasListModal } from './VaquitasListModal';

export function DepositPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [isVaquitasListOpen, setIsVaquitasListOpen] = useState(false);
  const [ isDepositing, setIsDepositing ] = useState(false);
  const { walletAddress, lockPeriod, network, token } = useNetworkConfigStore();
  const { trackUserAction } = useAnalytics();
  const editMode = useMapStore((store) => store.editMode);
  const disabled = lockPeriod < 0;
  
  // Hide Save button when in edit mode
  if (editMode !== null) {
    return null;
  }
  
  return (
    <div
      style={{ filter: disabled ? 'grayscale(100%)' : 'none' }}
      className="absolute bottom-20 md:bottom-10 left-0 flex flex-col items-center justify-center w-full gap-1"
    >
      <div className="w-full max-w-xl px-2">
        <HeroButton
          size="lg"
          isDisabled={disabled}
          onPress={() => {
            if (!walletAddress) {
              trackUserAction('deposit_attempted_no_wallet');
              if (network?.name && isEvmTypeNetwork(network.name)) {
                console.error('Not wallet found when user attempt to deposit');
              }
            } else {
              trackUserAction('deposit_modal_opened', {
                token: token?.symbol || null,
                lockPeriod,
                network: network?.name || null,
              });
              setIsOpen(true);
            }
          }}
          className={`bg-success border-[#018222] py-7 text-black font-bold w-full border border-b-5 rounded-md`}
        >
          <span className="text-xl text-black capitalize">
            {isDepositing ? <T>Processing...</T> : <T>Save</T>}
          </span>
        </HeroButton>
      </div>
      <DepositModal
        open={isOpen}
        onOpenChange={() => setIsOpen(false)}
        isDepositing={isDepositing}
        setIsDepositing={setIsDepositing}
      />
      {isVaquitasListOpen && <VaquitasListModal open={isVaquitasListOpen} onOpenChange={() => setIsVaquitasListOpen(false)} />}
    </div>
  );
}
