'use client';

import { Avatar, Badge, Button, Pagination, Spinner, Tab, Tabs } from '@heroui/react';
import Image from 'next/image';
import Link from 'next/link';
import { memo, useEffect, useMemo, useState } from 'react';
import { HiArrowSmallRight } from 'react-icons/hi2';
import { useProfilesByAverageDepositsData } from '../../hooks';
import { useNetworkConfigStore } from '../../stores';

function simplifyWallet(addr: string) {
  return `${addr.slice(0, 5)}...${addr.slice(-4)}`;
}

type WalletEntry = {
  walletAddress: string;
  totalSums: number;
  lastSum: number;
  count: number;
  nickname?: string | null;
  timestamp: number;
  delay: number;
  average: number;
};

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
      <span className="text-[8px] font-light  font-mono">{rest}</span>
    </>
  );
});

const podiumBlockHeights = ['h-28 ', 'h-20', 'h-12'];

const podiumBlockColors = ['bg-[#F5A161]', 'bg-[#5fb36a]', 'bg-[#6bb0c7]'];

const podiumAvatarBackgrounds = ['bg-[#F8C38E]', 'bg-[#C7E2B8]', 'bg-[#B8DAE3]'];

const podiumOrders = ['order-2', 'order-1', 'order-3'];

const rankEmojis = ['🥇', '🥈', '🥉'];

const getDisplayName = (wallet: WalletEntry) => {
  if (wallet.nickname) {
    return wallet.nickname.startsWith('@') ? wallet.nickname : `@${wallet.nickname}`;
  }
  return simplifyWallet(wallet.walletAddress);
};

const ITEMS_PER_PAGE = 5;

const TAB_KEYS = ['today', 'week', 'month'] as const;
type TabKey = (typeof TAB_KEYS)[number];

export const LeaderboardPage = () => {
  const { data: profiles = [], isLoading, error } = useProfilesByAverageDepositsData();
  const { walletAddress: currentUserWallet } = useNetworkConfigStore();
  const [selectedTab, setSelectedTab] = useState<TabKey>('month');
  const [pageByTab, setPageByTab] = useState<Record<TabKey, number>>({
    today: 1,
    week: 1,
    month: 1,
  });
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

  const renderLeaderboardContent = (wallets: WalletEntry[], page: number, onPageChange: (page: number) => void) => {
    if (wallets.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center text-center">
          <Image src="/vaquita/error.svg" alt="logo" width={200} height={200} />
          <p className="mt-4 text-lg font-medium text-black">No data in the leaderboard yet</p>
          <p className="mt-2 text-sm font-medium text-black">Be the first to appear here!</p>
        </div>
      );
    }

    const topThree = wallets.slice(0, 3);
    const rest = wallets.slice(3);
    const totalPages = Math.max(1, Math.ceil(rest.length / ITEMS_PER_PAGE));
    const safePage = Math.min(page, totalPages);
    const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
    const paginatedRest = rest.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    return (
      <div>
        <div className="relative">
          <div className="flex items-end justify-center md:my-8 my-4">
            {topThree.map((wallet, index) => {
              const isCurrentUser = currentUserWallet?.toLowerCase() === wallet.walletAddress.toLowerCase();
              const emoji = rankEmojis[index] ?? `${index + 1}`;
              const initials = getDisplayName(wallet).replace('@', '').slice(0, 2).toUpperCase();

              return (
                <Link
                  key={wallet.walletAddress}
                  href={`/leaderboard/${wallet.walletAddress}`}
                  className={`group relative flex w-full max-w-[150px] justify-center ${podiumOrders[index] ?? ''}`}
                  aria-label={`See profile of ${getDisplayName(wallet)}`}
                >
                  <div className="w-full px-2 flex flex-col items-center">
                    <div className="relative ">
                      <Avatar
                        radius="full"
                        className={`h-16 w-16 border border-black/10 text-lg font-semibold text-black ${podiumAvatarBackgrounds[index] ?? 'bg-[#F5E0C8]'} ${
                          isCurrentUser
                            ? 'ring-4 ring-primary/50 ring-offset-2 ring-offset-white'
                            : 'ring-2 ring-black/10 ring-offset-2 ring-offset-white'
                        }`}
                        name={initials}
                      />
                      <span className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full border-none bg-transparent text-lg text-black">
                        {emoji}
                      </span>
                    </div>

                    <div className="flex flex-col items-center gap-0.5 text-center">
                      <span className="text-sm font-semibold text-black">{getDisplayName(wallet)}</span>
                      <span className="text-[10px] font-medium text-black/60">
                        {simplifyWallet(wallet.walletAddress)}
                      </span>
                    </div>

                    <div className="flex flex-col items-center gap-1 text-center">
                      <span className="text-xs font-semibold uppercase tracking-wide text-black"></span>
                    </div>

                    <div className="relative mt-2 flex w-full items-end justify-center">
                      <div
                        className={`flex w-full items-center justify-center rounded-lg  ${podiumBlockColors[index] ?? 'bg-[#E27419]'} ${
                          podiumBlockHeights[index] ?? 'h-40'
                        }`}
                      >
                        <span className="text-sm font-bold ">
                          <Timer
                            totalSums={wallet.totalSums}
                            lastSum={wallet.lastSum}
                            count={wallet.count}
                            timestamp={wallet.timestamp}
                            delay={wallet.delay}
                          />
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="space-y-2 mt-4 bg-white rounded-lg">
          {paginatedRest.map((wallet, index) => {
            const position = startIndex + index + 4;
            const isCurrentUser = currentUserWallet?.toLowerCase() === wallet.walletAddress.toLowerCase();

            return (
              <Link
                key={wallet.walletAddress}
                href={`/leaderboard/${wallet.walletAddress}`}
                className={`group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 p-3 md:p-5 transition-all duration-200 hover:translate-x-1 hover:bg-white/20 ${
                  isCurrentUser ? 'bg-linear-to-r from-primary/20 to-[#E8934A]/20 border-primary/40' : ''
                }`}
                aria-label={`Ver perfil de ${getDisplayName(wallet)}`}
              >
                <Badge
                  content={`#${position}`}
                  className="mr-2 bg-[#FF9C1C] text-black text-[11px] border-black border-[0.5px]"
                  color="warning"
                >
                  <Avatar
                    radius="full"
                    className="h-12 w-12 bg-linear-to-br from-primary/80 to-[#E8934A]/80 text-black text-lg font-semibold"
                    name={getDisplayName(wallet).replace('@', '').slice(0, 2).toUpperCase()}
                  />
                </Badge>

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold ">{getDisplayName(wallet)}</span>
                  </div>
                  <span className="text-[10px] md:text-xs font-medium text-black/60">
                    {simplifyWallet(wallet.walletAddress)}
                  </span>
                </div>

                <div className="text-right flex flex-col items-end">
                  <span className="text-sm font-bold ">
                    <Timer
                      totalSums={wallet.totalSums}
                      lastSum={wallet.lastSum}
                      count={wallet.count}
                      timestamp={wallet.timestamp}
                      delay={wallet.delay}
                    />
                  </span>
                  <Button
                    isIconOnly
                    size="sm"
                    color="primary"
                    className="border-black border-1 text-black border-b-2 rounded-lg"
                  >
                    <HiArrowSmallRight />
                  </Button>
                </div>
              </Link>
            );
          })}
        </div>
        {totalPages > 1 && (
          <div className="flex justify-center mt-4">
            <Pagination
              total={totalPages}
              page={safePage}
              onChange={onPageChange}
              showControls
              color="primary"
              classNames={{
                base: 'rounded-lg backdrop-blur-md',
                item: '/70 data-[active=true]:bg-primary data-[active=true]: bg-white',
                cursor: 'bg-primary  shadow-lg shadow-primary/40',
                prev: '/70 hover: bg-white',
                next: '/70 hover: bg-white',
              }}
              boundaries={0}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-4xl flex-col items-center p-4">
      <div className="w-full mb-14 md:mb-0">
        <header className="relative mb-2 flex items-center justify-center py-2 ">
          <div className="absolute left-0 top-1/2 -translate-y-1/2">
            <Link href="/home" aria-label="Back to home">
              <Image src="/icons/arrow-back.svg" alt="arrow back" width={24} height={24} />
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold md:text-3xl">Leaderboard</h1>
          </div>

          <div className="absolute right-0 top-1/2 -translate-y-1/2">
            <Image src="/icons/share.svg" alt="share" width={24} height={24} className="cursor-not-allowed grayscale" />
          </div>
        </header>

        <section className="rounded-3xl border border-white/10 bg-white/10  backdrop-blur-xl md:pt-2">
          {isLoading && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center ">
              <Spinner size="lg" color="primary" />
              <p className="text-sm font-medium /70">Loading ...</p>
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-red-400/60 bg-red-500/10 p-6 text-center ">
              <p className="text-sm font-semibold text-red-200">Error loading leaderboard</p>
              <p className="mt-2 text-xs font-medium text-red-200/80">{`${error}`}</p>
            </div>
          )}

          {!isLoading && !error && (
            <Tabs
              aria-label="Leaderboard timeframe"
              variant="solid"
              // color="primary"
              selectedKey={selectedTab}
              // onSelectionChange={(key) => {
              //   const tabKey = key as TabKey;
              //   setSelectedTab(tabKey);
              //   setPageByTab((prev) => ({ ...prev, [tabKey]: 1 }));
              // }}
              className="w-full  rounded-lg"
              classNames={{
                tabList: 'bg-white rounded-lg p-0 gap-2 w-full',
                tab: 'rounded-lg px-4 py-1 text-sm font-medium  data-[selected=true]:bg-primary data-[selected=true]: transition-all',
                cursor: 'rounded-lg',
              }}
            >
              <Tab
                key="today"
                title={
                  <Badge
                    placement="bottom-right"
                    color="warning"
                    style={{ zIndex: -1, opacity: 0.6 }}
                    content={<span className="text-xs px-1">Soon</span>}
                  >
                    Today
                  </Badge>
                }
              >
                {renderLeaderboardContent(walletsWithXP, pageByTab.today, (page) =>
                  setPageByTab((prev) => ({ ...prev, today: page }))
                )}
              </Tab>
              <Tab
                key="week"
                title={
                  <Badge
                    placement="bottom-right"
                    color="warning"
                    style={{ zIndex: -1, opacity: 0.6 }}
                    content={<span className="text-xs px-1">Soon</span>}
                  >
                    Week
                  </Badge>
                }
                disabled
              >
                {renderLeaderboardContent(walletsWithXP, pageByTab.week, (page) =>
                  setPageByTab((prev) => ({ ...prev, week: page }))
                )}
              </Tab>
              <Tab key="month" title="Month" disabled>
                {renderLeaderboardContent(walletsWithXP, pageByTab.month, (page) =>
                  setPageByTab((prev) => ({ ...prev, month: page }))
                )}
              </Tab>
            </Tabs>
          )}
        </section>
      </div>
    </div>
  );
};
