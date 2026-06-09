'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { FiChevronRight } from 'react-icons/fi';
import { AppModal } from '../../molecules/AppModal';
import { CoinsModalProps } from './types';

// Each way to earn coins, paired with the global icon that represents it.
const EARN_WAYS = [
  { key: 'daily', icon: '/icons/global/coin.png' },
  { key: 'streak', icon: '/icons/global/streak_face.png' },
  { key: 'deposits', icon: '/icons/global/trophy.png' },
] as const;

export function CoinsModal({ open, onOpenChange, coins }: CoinsModalProps) {
  const { t } = useTranslation();
  const router = useRouter();

  const handleViewStats = () => {
    onOpenChange();
    router.push('/profile/summary');
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('rewards.coins.title', 'Coins')}
      size="md"
    >
      <div className="space-y-6 mb-2">
        {/* Hero — big coin balance */}
        <div className="flex flex-col items-center gap-2 pt-1">
          <div className="relative flex items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-primary/30 blur-2xl" aria-hidden />
            <Image
              src="/icons/global/coin.png"
              alt={t('rewards.coins.coinAlt', 'coins')}
              width={72}
              height={72}
              className="relative object-contain"
            />
          </div>
          <div className="text-center">
            <div className="text-4xl font-extrabold text-black leading-none tabular-nums">
              {coins.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
            <div className="mt-1 text-sm font-semibold text-gray-500">
              {t('rewards.coins.balanceLabel', '{{count}} coins', { count: coins })}
            </div>
          </div>
          <p className="max-w-xs text-center text-sm text-gray-600">
            {t(
              'rewards.coins.description',
              'Coins are your in-game currency. Earn them by saving and collecting your daily reward, then spend them in the shop to decorate your map.',
            )}
          </p>
        </div>

        {/* Ways to earn */}
        <div className="space-y-3 rounded-2xl border border-black border-b-2 bg-white p-4">
          <h3 className="text-sm font-bold text-black">{t('rewards.coins.earnTitle', 'Ways to earn')}</h3>
          <ul className="space-y-2.5">
            {EARN_WAYS.map(({ key, icon }) => (
              <li key={key} className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15">
                  <Image src={icon} alt="" width={20} height={20} className="object-contain" />
                </span>
                <span className="text-sm text-gray-700">
                  {t(`rewards.coins.earn.${key}`, key)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* View full stats */}
        <button
          type="button"
          onClick={handleViewStats}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-black border-b-2 bg-white py-3 text-sm font-bold text-black transition hover:-translate-y-0.5 hover:bg-gray-50"
        >
          {t('rewards.coins.viewStats', 'View full stats')}
          <FiChevronRight className="h-4 w-4" />
        </button>
      </div>
    </AppModal>
  );
}
