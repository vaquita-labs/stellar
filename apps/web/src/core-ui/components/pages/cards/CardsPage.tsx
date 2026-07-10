'use client';

import { toast } from '@heroui/react';
import React, { ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FiCloudSnow,
  FiCoffee,
  FiDollarSign,
  FiDroplet,
  FiEye,
  FiEyeOff,
  FiFilm,
  FiGlobe,
  FiInfo,
  FiLock,
  FiPlus,
  FiRepeat,
  FiShoppingCart,
  FiSmartphone,
  FiSun,
} from 'react-icons/fi';
import { useProfileData } from '../../../hooks';
import { useCardsStore } from '../../../stores';
import { PageLayout } from '../../molecules';
import { CardPinModal } from './CardPinModal';
import { CustomizeCardModal } from './CustomizeCardModal';
import { VirtualCard } from './VirtualCard';

function ActionButton({
  icon,
  iconClassName,
  label,
  description,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  iconClassName: string;
  label: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="relative w-full flex flex-col items-center justify-center gap-2 rounded-lg border border-black border-b-2 bg-white px-3 py-5 text-black hover:bg-[#F5FBFF] transition disabled:opacity-50"
    >
      <span className={`flex h-12 w-12 items-center justify-center rounded-full border ${iconClassName}`}>
        {icon}
      </span>
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-xs text-gray-500">{description}</span>
    </button>
  );
}

export function CardsPage() {
  const { t } = useTranslation();
  const { data: profile } = useProfileData();
  const frozen = useCardsStore((s) => s.frozen);
  const toggleFrozen = useCardsStore((s) => s.toggleFrozen);
  const [revealed, setRevealed] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  const holderName = profile?.nickname || t('cards.defaultHolder', 'Vaquita member');

  const handleToggleFrozen = () => {
    if (!frozen) setRevealed(false);
    toggleFrozen();
    toast.success(
      frozen
        ? t('cards.unfrozenToast', 'Card unfrozen. Ready to use!')
        : t('cards.frozenToast', 'Card frozen. No one can use it.')
    );
  };

  // Mocked activity/places: merchant names stay as-is, labels are translated.
  const transactions = [
    {
      key: 'coffee',
      icon: <FiCoffee />,
      name: 'Café La Vaquita',
      when: t('cards.activity.today', 'Today'),
      amount: '-$3.50',
      positive: false,
    },
    {
      key: 'market',
      icon: <FiShoppingCart />,
      name: 'SuperMarket 24',
      when: t('cards.activity.yesterday', 'Yesterday'),
      amount: '-$24.90',
      positive: false,
    },
    {
      key: 'streaming',
      icon: <FiFilm />,
      name: 'Streaming Plus',
      when: t('cards.activity.yesterday', 'Yesterday'),
      amount: '-$9.99',
      positive: false,
    },
    {
      key: 'topup',
      icon: <FiPlus />,
      name: t('cards.activity.topUp', 'Card top-up'),
      when: t('cards.activity.daysAgo', '{{count}} days ago', { count: 3 }),
      amount: '+$50.00',
      positive: true,
    },
  ];

  const places = [
    {
      key: 'online',
      icon: <FiGlobe />,
      label: t('cards.places.online', 'Online purchases'),
      description: t('cards.places.onlineDesc', 'Pay in your favorite stores and apps.'),
    },
    {
      key: 'contactless',
      icon: <FiSmartphone />,
      label: t('cards.places.contactless', 'Contactless payments'),
      description: t('cards.places.contactlessDesc', 'Add it to Apple Pay or Google Pay.'),
    },
    {
      key: 'atm',
      icon: <FiDollarSign />,
      label: t('cards.places.atm', 'ATM withdrawals'),
      description: t('cards.places.atmDesc', 'Get cash at ATMs worldwide.'),
    },
    {
      key: 'subscriptions',
      icon: <FiRepeat />,
      label: t('cards.places.subscriptions', 'Subscriptions'),
      description: t('cards.places.subscriptionsDesc', 'Streaming, gaming and more.'),
    },
  ];

  return (
    <PageLayout
      title={t('cards.title', 'My card')}
      rightSlot={
        <span className="text-[10px] font-bold uppercase tracking-wider bg-primary text-black border border-black border-b-2 rounded-full px-3 py-1">
          {t('common.soon')}
        </span>
      }
    >
      <VirtualCard holderName={holderName} revealed={revealed && !frozen} />

      <section className="grid grid-cols-2 gap-3">
        <ActionButton
          icon={revealed ? <FiEyeOff className="h-6 w-6" /> : <FiEye className="h-6 w-6" />}
          iconClassName="bg-[#DDF4FF] border-[#84D8FF]"
          label={
            revealed
              ? t('cards.actions.hideDetails', 'Hide details')
              : t('cards.actions.showDetails', 'Show details')
          }
          description={t('cards.actions.detailsDesc', 'Number and CVV')}
          onClick={() => setRevealed((v) => !v)}
          disabled={frozen}
        />
        <ActionButton
          icon={<FiLock className="h-6 w-6" />}
          iconClassName="bg-[#FFF7E6] border-primary"
          label={t('cards.actions.showPin', 'View PIN')}
          description={t('cards.actions.showPinDesc', 'For ATMs and stores')}
          onClick={() => setPinOpen(true)}
          disabled={frozen}
        />
        <ActionButton
          icon={frozen ? <FiSun className="h-6 w-6" /> : <FiCloudSnow className="h-6 w-6" />}
          iconClassName="bg-[#DDF4FF] border-[#84D8FF]"
          label={
            frozen
              ? t('cards.actions.unfreeze', 'Unfreeze card')
              : t('cards.actions.freeze', 'Freeze card')
          }
          description={
            frozen
              ? t('cards.actions.unfreezeDesc', 'Enable it again')
              : t('cards.actions.freezeDesc', 'Block it temporarily')
          }
          onClick={handleToggleFrozen}
        />
        <ActionButton
          icon={<FiDroplet className="h-6 w-6" />}
          iconClassName="bg-[#E8FBE9] border-[#84E89B]"
          label={t('cards.actions.customize', 'Customize')}
          description={t('cards.actions.customizeDesc', 'Colors and stickers')}
          onClick={() => setCustomizeOpen(true)}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-extrabold uppercase tracking-wider text-gray-500 px-1">
          {t('cards.activity.title', 'Recent activity')}
        </h2>
        <ul className="rounded-2xl border border-black border-b-2 bg-white overflow-hidden divide-y divide-gray-200">
          {transactions.map((tx) => (
            <li key={tx.key} className="flex items-center justify-between gap-3 px-4 py-3.5">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#FFF7E6] border border-primary text-black shrink-0">
                  {tx.icon}
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-bold text-black truncate">{tx.name}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{tx.when}</p>
                </div>
              </div>
              <p className={`text-sm font-bold shrink-0 ${tx.positive ? 'text-success' : 'text-black'}`}>
                {tx.amount}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-extrabold uppercase tracking-wider text-gray-500 px-1">
          {t('cards.places.title', 'Where you can use it')}
        </h2>
        <ul className="rounded-2xl border border-black border-b-2 bg-white overflow-hidden divide-y divide-gray-200">
          {places.map((place) => (
            <li key={place.key} className="flex items-center gap-3 px-4 py-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#DDF4FF] border border-[#84D8FF] text-black shrink-0">
                {place.icon}
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-black truncate">{place.label}</p>
                <p className="text-xs text-gray-600 mt-0.5">{place.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-black border-b-2 bg-white p-4 sm:p-5 flex items-start gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#FFF7E6] border border-primary text-black shrink-0">
          <FiInfo />
        </span>
        <div className="text-sm">
          <p className="font-semibold text-black">{t('cards.demo.title', 'Sneak peek')}</p>
          <p className="text-gray-600 mt-0.5">
            {t(
              'cards.demo.description',
              'The Vaquita card is coming soon. Everything you see here is a preview — no real card exists yet.'
            )}
          </p>
        </div>
      </section>

      <CardPinModal open={pinOpen} onOpenChange={() => setPinOpen(false)} />
      <CustomizeCardModal open={customizeOpen} onOpenChange={() => setCustomizeOpen(false)} />
    </PageLayout>
  );
}
