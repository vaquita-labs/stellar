'use client';

import { Button, Spinner } from '@heroui/react';
import Image from 'next/image';
import React, { useEffect, useRef } from 'react';
import { useProfileRewards } from '../../hooks';
import { SILVER_COIN, useElementPositionsStore } from '../../stores';

export const RewardCoinsButton = () => {
  const { data, isRefetching, isLoading } = useProfileRewards();
  const secondCoinRef = useRef<HTMLDivElement>(null);
  const setPositions = useElementPositionsStore((store) => store.setPositions);

  useEffect(() => {
    setPositions(SILVER_COIN, () => {
      const rect = secondCoinRef.current?.getBoundingClientRect() || { left: 0, width: 0, top: 0, height: 0 };
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    });
  }, [setPositions]);

  return (
    <Button
      className="bg-transparent rounded-lg gap-2 min-w-0 shrink absolute top-14 md:top-16 left-0 md:left-2 z-10"
    >
      {isRefetching || isLoading ? (
        <Spinner size="sm" color="current" />
      ) : (
        <>
          <div className="flex items-center gap-1" ref={secondCoinRef}>
            <Image
              src="/icons/summary/silver_coin.png"
              alt="Silver Coin"
              width={typeof window !== 'undefined' && window.innerWidth < 768 ? 24 : 40}
              height={typeof window !== 'undefined' && window.innerWidth < 768 ? 24 : 40}
              className="object-contain"
              priority
            />
            <span className="text-xs font-semibold text-black" style={{ minWidth: 24 }}>
              {data?.rewards?.find((reward) => reward?.name === 'Silver Coin')?.amount ?? 0}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Image
              src="/icons/summary/gold_coin.png"
              alt="Gold Coin"
              width={typeof window !== 'undefined' && window.innerWidth < 768 ? 24 : 40}
              height={typeof window !== 'undefined' && window.innerWidth < 768 ? 24 : 40}
              className="object-contain"
              priority
            />
            <span className="text-xs font-semibold text-black" style={{ minWidth: 24 }}>
              {data?.rewards?.find((reward) => reward?.name === 'Gold Coin')?.amount ?? 0}
            </span>
          </div>
        </>
      )}
    </Button>
  );
};
