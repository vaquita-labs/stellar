'use client';

import { Button, Spinner } from '@heroui/react';
import Image from 'next/image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProfileStreak } from '../../hooks';
import { StreakModal } from '../organisms';

export const StreakButton = () => {
  const { t } = useTranslation();
  const [showStreakModal, setShowStreakModal] = useState(false);
  const { data, isLoading, isRefetching } = useProfileStreak();

  return (
    <>
      <Button
        onPress={() => setShowStreakModal(true)}
        className="bg-transparent rounded-lg gap-1 min-w-0 shrink"
      >
        {isLoading || isRefetching ? (
          <Spinner size="sm" color="current" />
        ) : (
          <>
            <Image
              src="/icons/global/streak.png"
              alt={t('home.stats.streakAlt', 'Streak')}
              width={typeof window !== 'undefined' && window.innerWidth < 768 ? 24 : 40}
              height={typeof window !== 'undefined' && window.innerWidth < 768 ? 24 : 40}
              className="object-contain"
              priority
              style={data?.todayStreak ? {} : { filter: 'grayscale(100%)' }}
            />
            <span className="text-xs font-semibold text-black">
              {(data?.yesterdayStreak || 0) + (data?.todayStreak ? 1 : 0)}
            </span>
          </>
        )}
      </Button>
      {showStreakModal && <StreakModal open={showStreakModal} onOpenChange={() => setShowStreakModal(false)} />}
    </>
  );
};
