'use client';

import { Button } from '@heroui/react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { formatTimeDeposit } from '../../helpers';
import { useNetworkConfigStore } from '../../stores';
import { T } from '../atoms';
import { addSuccessToast } from '../molecules';
import { DepositModal } from './DepositModal';
import { VaquitasListModal } from './VaquitasListModal';

export function DepositPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [isVaquitasListOpen, setIsVaquitasListOpen] = useState(false);
  const [isDepositing, setIsDepositing] = useState(false);
  const { walletAddress, lockPeriod, network, setLockPeriod, token, setToken } = useNetworkConfigStore();
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
  };

  const handleChangeNextToken = () => {
    const currentIndex = availableTokens.findIndex((tk) => tk.symbol === token?.symbol);
    const nextIndex = (currentIndex + 1) % availableTokens.length;
    const nextToken = availableTokens[nextIndex];
    if (nextToken) {
      setToken(nextToken);

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
      className="absolute bottom-26 md:bottom-10 left-0 flex flex-col items-center justify-center w-full gap-1"
    >
      <div className="w-full sm:w-2/4 px-2 flex items-center justify-between gap-1">
        <Button
          className="w-3/4 bg-white rounded-md border border-black"
          onPress={handleChangeNextLockPeriod}
        >
          {formatTimeDeposit(lockPeriod)}
        </Button>
        {token && availableTokens.length > 0 && (
          <Button
            variant="primary"
            className="flex w-1/4 items-center justify-center text-black gap-0 rounded-md border border-black bg-white"
            onPress={handleChangeNextToken}
          >
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
        <Button
          size="lg"
          isDisabled={disabled}
          onPress={() => {
            if (!walletAddress) {
              router.replace('/profile');
              addSuccessToast(<T>First connect your wallet</T>);
            } else {
              setIsOpen(true);
            }
          }}
          className={`bg-success border-[#018222] py-6 text-white font-bold w-full border border-b-5  rounded-md`}
        >
          <span className="text-xl text-black font-bold capitalize">
            <T>{isDepositing ? 'processing...' : 'deposit'}</T>
          </span>
        </Button>
      </div>
      <DepositModal
        open={isOpen}
        onOpenChange={() => setIsOpen(false)}
        isDepositing={isDepositing}
        setIsDepositing={setIsDepositing}
      />
      {isVaquitasListOpen && (
        <VaquitasListModal open={isVaquitasListOpen} onOpenChange={() => setIsVaquitasListOpen(false)} />
      )}
    </div>
  );
}
