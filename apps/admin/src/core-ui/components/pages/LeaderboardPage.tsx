'use client';

import Image from 'next/image';
import Link from 'next/link';
import { memo, useEffect, useMemo, useState } from 'react';
import { useProfilesByAverageDepositsData } from '../../hooks';
import { useNetworkConfigStore } from '../../stores';

function simplifyWallet(addr: string) {
  return `${addr.slice(0, 5)}...${addr.slice(-4)}`;
}

const DELAY = 100;

const formatTime = (value: string) => {
  const [intPart, decPartRaw = ''] = value.split('.');
  const decPart = decPartRaw.padEnd(2, '0'); // asegurar al menos 2 decimales

  const main = `${intPart}.${decPart.slice(0, 2)}`;
  const rest = decPartRaw.slice(2, 5); // los 4 siguientes

  return { main, rest };
};

const Timer = memo(function Timer({
  totalSums,
  lastSum,
  count,
  timestamp,
  delay,
}: {
  totalSums: number;
  lastSum: number;
  count: number;
  timestamp: number;
  delay: number;
}) {
  const diffCount = Math.trunc(Date.now() - new Date(timestamp).getTime());
  const [extraSum, setExtraSum] = useState(diffCount * lastSum);
  const [counter, setCounter] = useState((count - 1) * delay + diffCount);
  const average = totalSums / count;
  useEffect(() => {
    const diffCount = Math.trunc(Date.now() - new Date(timestamp).getTime());
    setExtraSum(diffCount * lastSum);
    setCounter((count - 1) * delay + diffCount);
  }, [lastSum, count, delay, timestamp]);
  useEffect(() => {
    const interval = setInterval(() => {
      setExtraSum((prevState) => prevState + lastSum * DELAY);
      setCounter((prevState) => prevState + DELAY);
    }, DELAY);
    return () => {
      clearInterval(interval);
    };
  }, [lastSum]);
  const total = (average * delay * count) / counter + extraSum / counter;
  const { main, rest } = formatTime(total.toFixed(8));

  return (
    <>
      {main}
      <span className="text-xs font-light text-gray-500 font-mono">{rest}</span>
    </>
  );
});

export const LeaderboardPage = () => {
  const { data: profiles = [], isLoading, error } = useProfilesByAverageDepositsData();
  const { walletAddress: currentUserWallet, network } = useNetworkConfigStore();

  const walletsWithXP = useMemo(() => {
    return profiles
      .map((wallet) => {
        return {
          ...wallet,
          average: wallet.count !== 0 ? wallet.totalSums / wallet.count : 0,
        };
      })
      .sort((a, b) => b.average - a.average);
  }, [profiles]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-0 md:py-6">
      <div className="h-full mb-28 md:mb-8 w-full max-w-4xl">
        <header className="relative flex flex-col items-center justify-center py-4">
          <h1 className="text-3xl font-bold text-black mb-0">Leaderboard</h1>
          {network?.name && <span className="text-xs text-gray-400">{network.name}</span>}
        </header>

        <section className="bg-white rounded-3xl p-4 md:p-6 shadow-xl border border-gray-200 space-y-3">
          {isLoading && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-gray-600">Loading ranking...</p>
            </div>
          )}
          {error && (
            <div className="text-center py-8">
              <div className="bg-red-50 border border-red-200 rounded-xl p-6">
                <p className="text-red-600 font-medium">Error loading leaderboard</p>
                <p className="text-red-500 text-sm mt-2">{`${error}`}</p>
              </div>
            </div>
          )}
          {!isLoading && !error && walletsWithXP.length === 0 && (
            <div className="text-center py-12 flex flex-col items-center justify-center">
              <Image src="/vaquita/error.svg" alt="logo" width={200} height={200} />
              <p className="text-gray-500 text-lg mt-4">No data in the leaderboard yet</p>
              <p className="text-gray-400 text-sm mt-2">Be the first to appear here!</p>
            </div>
          )}

          {walletsWithXP.map(
            ({ walletAddress, average: xp, totalSums, lastSum, count, nickname, timestamp, delay }, i) => {
              const isCurrentUser = currentUserWallet?.toLowerCase() === walletAddress.toLowerCase();
              const isTopThree = i < 3;

              // Colores para los primeros 3 lugares
              const getRankColor = (index: number, xp: number) => {
                const defaultColor = 'bg-gradient-to-br from-primary to-[#E8934A]';
                if (xp === 0) {
                  return defaultColor;
                }
                switch (index) {
                  case 0:
                    return 'bg-gradient-to-br from-yellow-400 to-yellow-500'; // Oro
                  case 1:
                    return 'bg-gradient-to-br from-gray-300 to-gray-400'; // Plata
                  case 2:
                    return 'bg-gradient-to-br from-amber-600 to-amber-700'; // Bronce
                  default:
                    return defaultColor; // Color primary
                }
              };

              const getRankIcon = (index: number, xp: number) => {
                const defaultIcon = `${i + 1}`;
                if (xp === 0) {
                  return '-';
                }
                switch (index) {
                  case 0:
                    return '🥇';
                  case 1:
                    return '🥈';
                  case 2:
                    return '🥉';
                  default:
                    return defaultIcon;
                }
              };

              return (
                <Link
                  key={walletAddress}
                  href={`/leaderboard/${walletAddress}`}
                  className={`flex items-center justify-between p-4 rounded-2xl transition-all duration-200 hover:scale-[1.02] ${
                    isCurrentUser
                      ? 'bg-gradient-to-r from-primary/20 to-[#E8934A]/20 border-2 border-primary shadow-lg'
                      : 'bg-gray-50 border border-gray-200 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-lg shadow-lg ${getRankColor(i, xp)}`}
                    >
                      {getRankIcon(i, xp)}
                    </div>

                    <div className="flex flex-col">
                      <div className="flex items-center flex-wrap">
                        <span className="font-medium text-gray-900 text-xs md:text-base">
                          {simplifyWallet(walletAddress)}
                        </span>
                      </div>
                      {isTopThree && (
                        <span className="text-xs text-gray-600 font-medium">
                          {i === 0 && !!xp && 'First Place'}
                          {i === 1 && !!xp && 'Second Place'}
                          {i === 2 && !!xp && 'Third Place'}
                        </span>
                      )}
                      {nickname && <span className="text-xs text-gray-400">@{nickname}</span>}
                    </div>
                  </div>

                  <div className="text-end">
                    <span className="text-md md:text-xl font-bold text-gray-900">
                      <Timer
                        totalSums={totalSums}
                        lastSum={lastSum}
                        count={count}
                        timestamp={timestamp}
                        delay={delay}
                      />
                    </span>
                    {/* <span className="text-sm font-medium text-gray-600">XP</span> */}
                    {isTopThree && (
                      <div className="text-xs text-gray-500">
                        {i === 0 && !!xp && '🌟 Legendary'}
                        {i === 1 && !!xp && '⭐ Epic'}
                        {i === 2 && !!xp && '✨ Rare'}
                      </div>
                    )}
                  </div>
                </Link>
              );
            }
          )}
        </section>
      </div>
    </div>
  );
};
