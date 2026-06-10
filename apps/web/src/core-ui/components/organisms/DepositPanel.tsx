'use client';

import { isStellarNetwork } from '@/networks/stellar';
import { Button as HeroButton } from '@heroui/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnalytics, useIsPoolPaused } from '../../hooks';
import { useMapStore, useConfigStore } from '../../stores';
import { DepositModal } from './DepositModal';
import { VaquitasListModal } from './VaquitasListModal';

export function DepositPanel() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [isVaquitasListOpen, setIsVaquitasListOpen] = useState(false);
  const [ isDepositing, setIsDepositing ] = useState(false);
  const { walletAddress, lockPeriod, network, token } = useConfigStore();
  const { trackUserAction } = useAnalytics();
  const editMode = useMapStore((store) => store.editMode);
  const isStellar = network?.networkName ? isStellarNetwork(network.networkName) : false;
  const { isPaused } = useIsPoolPaused();
  const disabled = lockPeriod < 0 || (isStellar && isPaused);

  // Hide Save button when in edit mode
  if (editMode !== null) {
    return null;
  }

  return (
    <div
      style={{ filter: disabled ? 'grayscale(100%)' : 'none' }}
      className="absolute bottom-20 md:bottom-10 left-0 flex flex-col items-center justify-center w-full gap-1"
    >
      {isStellar && isPaused && (
        <p className="text-sm text-warning font-semibold">
          {t('deposit.panel.paused', 'Deposits are temporarily paused')}
        </p>
      )}
      <div className="w-full max-w-xl px-2">
        <HeroButton
          size="lg"
          isDisabled={disabled}
          onPress={() => {
            if (!walletAddress) {
              trackUserAction('deposit_attempted_no_wallet');
            } else {
              trackUserAction('deposit_modal_opened', {
                token: token?.symbol || null,
                lockPeriod,
                network: network?.networkName || null,
              });
              setIsOpen(true);
            }
          }}
          className={`bg-success border-[#018222] py-7 text-black font-bold w-full border border-b-5 rounded-md`}
        >
          <span className="text-xl text-black capitalize">
            {isDepositing ? t('deposit.processing', 'Processing...') : t('common.save')}
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
