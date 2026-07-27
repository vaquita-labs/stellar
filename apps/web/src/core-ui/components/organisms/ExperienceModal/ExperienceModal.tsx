'use client';

import { deriveLevel } from '@/core-ui/helpers';
import Image from 'next/image';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AppModal } from '../../molecules/AppModal';
import { ExperienceModalProps } from './types';

export function ExperienceModal({ open, onOpenChange, experience }: ExperienceModalProps) {
  const { t } = useTranslation();

  const totalXp = Math.round(experience);
  const { level, xpIntoLevel, xpForNextLevel } = useMemo(() => deriveLevel(totalXp), [totalXp]);
  const pct = Math.min(100, (xpIntoLevel / xpForNextLevel) * 100);

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('rewards.experience.title', 'Experience')}
      size="md"
    >
      <div className="space-y-6 mb-2">
        {/* Hero — big XP count + current level */}
        <div className="flex flex-col items-center gap-1 pt-1">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-primary/30 blur-2xl" aria-hidden />
              <Image
                src="/icons/global/star.png"
                alt={t('rewards.experience.xpAlt', 'experience')}
                width={56}
                height={56}
                className="relative object-contain"
              />
            </div>
            <div className="text-5xl font-extrabold text-black leading-none tabular-nums">
              {totalXp.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
          {/* Qué es el número + el nivel al que corresponde. El número solo
              no dice si son XP o niveles (ver StreakModal). */}
          <div className="text-sm font-semibold text-gray-500">
            {t('rewards.experience.unitLabel', 'XP · Level {{level}}', { level })}
          </div>
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

        {/* Explicación al final y alineada a la izquierda (ver StreakModal). */}
        <p className="text-sm leading-relaxed text-gray-600">
          {t(
            'rewards.experience.description',
            'You earn XP every time you save and keep your streak. Reach new levels to show off your saving progress!',
          )}
        </p>
      </div>
    </AppModal>
  );
}
