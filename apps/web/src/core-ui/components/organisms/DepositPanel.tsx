'use client';

import { addToast, Button as HeroButton, useDisclosure } from '@heroui/react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { formatTimeDeposit } from '../../helpers';
import { useAnalytics } from '../../hooks';
import { useNetworkConfigStore } from '../../stores';
import { T } from '../atoms';
import { Button } from '../atoms/Button';
import { DepositModal } from './DepositModal';
import { VaquitasListModal } from './VaquitasListModal';

export function DepositPanel() {
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const { isOpen: isVaquitasListOpen, onOpenChange: onVaquitasListOpenChange } = useDisclosure();
  const [isDepositing, setIsDepositing] = useState(false);
  const { walletAddress, lockPeriod, network, setLockPeriod, token, setToken } = useNetworkConfigStore();
  const { trackUserAction, trackConversion } = useAnalytics();
  const router = useRouter();
  const lockPeriods = network?.tokens.find((tk) => tk.symbol === token?.symbol)?.lockPeriod || [];
  const disabled = lockPeriod < 0;

  const availableTokens = useMemo(() => {
    if (!network?.tokens) return [];
    return network.tokens.filter((tk, index, self) => index === self.findIndex((t) => t.symbol === tk.symbol));
  }, [network?.tokens]);

  const handleChangeNextLockPeriod = () => {
    const currentIndex = lockPeriods.findIndex((lp) => lp === lockPeriod);
    const nextIndex = (currentIndex + 1) % lockPeriods.length;
    const newLockPeriod = lockPeriods[nextIndex];
    setLockPeriod(newLockPeriod);

    // Track lock period change
    trackUserAction('lock_period_changed', {
      fromPeriod: lockPeriod,
      toPeriod: newLockPeriod,
      token: token?.symbol || null,
    });
  };

  const handleChangeNextToken = () => {
    const currentIndex = availableTokens.findIndex((tk) => tk.symbol === token?.symbol);
    const nextIndex = (currentIndex + 1) % availableTokens.length;
    const nextToken = availableTokens[nextIndex];
    if (nextToken) {
      setToken(nextToken);

      // Track token change
      trackUserAction('token_changed', {
        fromToken: token?.symbol || null,
        toToken: nextToken.symbol,
        network: network?.name || null,
      });

      if (nextToken.lockPeriod && nextToken.lockPeriod.length > 0) {
        const currentLockPeriod = lockPeriod;
        const hasCurrentLockPeriod = nextToken.lockPeriod.includes(currentLockPeriod);

        if (hasCurrentLockPeriod) {
          setLockPeriod(currentLockPeriod);
        } else {
          const closest = nextToken.lockPeriod.reduce((prev, curr) => {
            return Math.abs(curr - currentLockPeriod) < Math.abs(prev - currentLockPeriod) ? curr : prev;
          });
          setLockPeriod(closest);
        }
      }
    }
  };

  return (
    <div
      style={{ filter: disabled ? 'grayscale(100%)' : 'none' }}
      className="absolute bottom-20 md:bottom-10 left-0 flex flex-col items-center justify-center w-full gap-1"
    >
      <div className="w-full sm:w-2/4 px-2 flex items-center justify-between gap-1">
        <Button className="w-3/4" secondary onPress={handleChangeNextLockPeriod}>
          {formatTimeDeposit(lockPeriod)}
        </Button>
        {token && availableTokens.length > 0 && (
          <Button secondary className="w-1/4" onPress={handleChangeNextToken}>
            <div className="flex items-center gap-0">
              <Image
                src={`/chains/${token.symbol.toUpperCase()}.png`}
                alt={token.symbol}
                width={32}
                height={32}
                className="rounded-full"
                priority
              />
            </div>
          </Button>
        )}
      </div>
      <div className="w-full sm:w-2/4 px-2">
        <HeroButton
          size="lg"
          disabled={disabled}
          onPress={() => {
            if (!walletAddress) {
              trackUserAction('deposit_attempted_no_wallet');
              // router.replace('/profile');
              addToast({
                title: <T>First connect your wallet</T>,
                color: 'success',
                variant: 'solid',
                timeout: 60000,
              });
            } else {
              trackUserAction('deposit_modal_opened', {
                token: token?.symbol || null,
                lockPeriod,
                network: network?.name || null,
              });
              onOpen();
            }
          }}
          className={`bg-success border-[#018222] py-6 text-white font-bold w-full border border-b-5  rounded-md`}
        >
          <span className="text-xl text-black font-bold capitalize">
            <T>{isDepositing ? 'Processing...' : 'Deposit'}</T>
          </span>
        </HeroButton>
      </div>
      <DepositModal
        open={isOpen}
        onOpenChange={onOpenChange}
        isDepositing={isDepositing}
        setIsDepositing={setIsDepositing}
      />
      {isVaquitasListOpen && <VaquitasListModal open={isVaquitasListOpen} onOpenChange={onVaquitasListOpenChange} />}
    </div>
  );
}
