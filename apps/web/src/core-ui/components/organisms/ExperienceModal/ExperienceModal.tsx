'use client';

import { deriveLevel } from '@/core-ui/helpers';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FiChevronRight } from 'react-icons/fi';
import { AppModal } from '../../molecules/AppModal';
import { ExperienceModalProps } from './types';

export function ExperienceModal({ open, onOpenChange, experience }: ExperienceModalProps) {
  const { t } = useTranslation();
  const router = useRouter();

  const totalXp = Math.round(experience);
  const { level, xpIntoLevel, xpForNextLevel } = useMemo(() => deriveLevel(totalXp), [totalXp]);
  const pct = Math.min(100, (xpIntoLevel / xpForNextLevel) * 100);

  const handleViewStats = () => {
    onOpenChange();
    router.push('/profile/summary#xp-level');
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('rewards.experience.title', 'Experience')}
      size="md"
    >
      <div className="space-y-6 mb-2">
        {/* Hero — big XP count + current level */}
        <div className="flex flex-col items-center gap-2 pt-1">
          <div className="relative flex items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-primary/30 blur-2xl" aria-hidden />
            <Image
              src="/icons/global/star.png"
              alt={t('rewards.experience.xpAlt', 'experience')}
              width={72}
              height={72}
              className="relative object-contain"
            />
          </div>
          <div className="text-center">
            <div className="text-4xl font-extrabold text-black leading-none tabular-nums">
              {totalXp.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
            <div className="mt-1 text-sm font-semibold text-gray-500">
              {t('rewards.experience.levelLabel', 'Level {{level}}', { level })}
            </div>
          </div>
          <p className="max-w-xs text-center text-sm text-gray-600">
            {t(
              'rewards.experience.description',
              'You earn XP every time you save and keep your streak. Reach new levels to show off your saving progress!',
            )}
          </p>
        </div>

        {/* Level progress */}
        <div className="space-y-3 rounded-2xl border border-black border-b-2 bg-white p-4">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-bold text-black">
              {t('rewards.experience.levelProgress', 'Level progress')}
            </h3>
            <span className="text-[11px] font-semibold text-gray-500 tabular-nums">
              {xpIntoLevel} / {xpForNextLevel} XP
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full border border-black/10 bg-black/10">
            <div className="h-full border-r-2 border-black/20 bg-primary" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600">{t('rewards.experience.totalExperience', 'Total experience')}</span>
            <span className="font-bold text-black tabular-nums">
              {totalXp.toLocaleString(undefined, { maximumFractionDigits: 0 })} XP
            </span>
          </div>
        </div>

        {/* View full stats */}
        <button
          type="button"
          onClick={handleViewStats}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-black border-b-2 bg-white py-3 text-sm font-bold text-black transition hover:-translate-y-0.5 hover:bg-gray-50"
        >
          {t('rewards.experience.viewStats', 'View full stats')}
          <FiChevronRight className="h-4 w-4" />
        </button>
      </div>
    </AppModal>
  );
}
