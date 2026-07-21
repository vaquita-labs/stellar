'use client';

import { getCurrentDay } from '@/core-ui/helpers';
import { useProfileStreak } from '@/core-ui/hooks';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { FiChevronRight } from 'react-icons/fi';
import { ONE_DAY } from '../../../config/constants';
import { AppModal } from '../../molecules/AppModal';
import { StreakModalProps } from './types';

const DATES_ABBR = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function StreakModal({ open, onOpenChange }: StreakModalProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { data } = useProfileStreak();

  const currentStreak = (data?.yesterdayStreak || 0) + (data?.todayStreak ? 1 : 0);

  const weeklyProgress = [];
  let day = getCurrentDay(new Date()) - 5;
  const todayDay = getCurrentDay(new Date());
  for (let i = 0; i < 7; i++) {
    const date = new Date(day * ONE_DAY);
    weeklyProgress.push({
      day: DATES_ABBR[date.getDay()] || '',
      completed: data?.days?.includes(day),
      future: day > todayDay,
      isToday: day === todayDay,
      init: day,
    });
    day++;
  }

  const handleViewHistory = () => {
    onOpenChange();
    router.push('/profile/summary#streak-history');
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('rewards.streak.title', 'Streak')}
      size="md"
    >
      <div className="space-y-6 mb-2">
        {/* Hero — big streak count */}
        <div className="flex flex-col items-center gap-2 pt-1">
          <div className="relative flex items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-primary/30 blur-2xl" aria-hidden />
            <Image
              src="/icons/global/streak_face.png"
              alt={t('rewards.streak.streakAlt', 'streak')}
              width={72}
              height={72}
              className="relative object-contain"
            />
          </div>
          <div className="text-center">
            <div className="text-4xl font-extrabold text-black leading-none tabular-nums">
              {currentStreak}
            </div>
            <div className="mt-1 text-sm font-semibold text-gray-500">
              {t('rewards.streak.dayStreakLabel', '{{count}} day streak', { count: currentStreak })}
            </div>
          </div>
          <p className="max-w-xs text-center text-sm text-gray-600">
            {t(
              'rewards.streak.description',
              'Your streak represents consecutive days of activity. Keep it going to unlock rewards and special tiles for your map!',
            )}
          </p>
        </div>

        {/* Weekly Progress Section */}
        <div className="space-y-3 rounded-2xl border border-black border-b-2 bg-white p-4">
          <h3 className="text-sm font-bold text-black">{t('rewards.streak.weeklyProgress', 'Weekly Progress')}</h3>
          <div className="grid grid-cols-7 gap-x-1 gap-y-2 text-center">
            {weeklyProgress.map(({ day, isToday }, index) => (
              <span
                key={`label-${index}`}
                className={`text-[10px] font-bold uppercase tracking-wider ${isToday ? 'text-primary' : 'text-gray-400'}`}
              >
                {day ? t(`rewards.streak.weekdays.${day}`, day) : ''}
              </span>
            ))}
            {weeklyProgress.map(({ future, completed, isToday }, index) => {
              if (future) {
                return (
                  <div
                    key={`cell-${index}`}
                    className="mx-auto h-9 w-9 rounded-full border border-dashed border-gray-300 bg-gray-100/60"
                    aria-hidden
                  />
                );
              }
              return (
                <div
                  key={`cell-${index}`}
                  className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full ${
                    completed ? 'bg-primary/15' : 'bg-black/5'
                  } ${isToday ? 'ring-2 ring-black ring-offset-1 ring-offset-white' : ''}`}
                >
                  {completed ? (
                    <Image
                      src="/icons/global/streak_face.png"
                      alt={t('rewards.streak.streakAlt', 'streak')}
                      width={22}
                      height={22}
                      className="object-contain"
                    />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-black/20" aria-hidden />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* View full history */}
        <button
          type="button"
          onClick={handleViewHistory}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-black border-b-2 bg-white py-3 text-sm font-bold text-black transition hover:-translate-y-0.5 hover:bg-gray-50"
        >
          {t('rewards.streak.viewHistory', 'View full history')}
          <FiChevronRight className="h-4 w-4" />
        </button>
      </div>
    </AppModal>
  );
}
