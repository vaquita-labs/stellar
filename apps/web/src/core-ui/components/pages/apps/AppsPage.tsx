'use client';

import { useTranslation } from 'react-i18next';
import { FiGift, FiGrid, FiUsers } from 'react-icons/fi';
import { PageLayout } from '../../molecules/PageLayout';

/**
 * The Apps tab: the fun things to do with Vaquita, beyond saving. Nothing is
 * live yet, so the page says what is coming and no more; each entry becomes a
 * row that opens when it ships.
 */
export function AppsPage() {
  const { t } = useTranslation();

  const soon = [
    {
      icon: FiUsers,
      title: t('appsPage.soon.groups.title', 'Save with friends'),
      body: t('appsPage.soon.groups.body', 'A shared goal, everyone chips in.'),
    },
    {
      icon: FiGift,
      title: t('appsPage.soon.rewards.title', 'Rewards'),
      body: t('appsPage.soon.rewards.body', 'Little prizes for keeping your savings going.'),
    },
  ];

  return (
    <PageLayout title={t('appsPage.title', 'Apps')} backHref="/home" contentGap="gap-5" bottomPadding="pb-6">
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-primary/30 px-5 py-7 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white">
          <FiGrid className="h-6 w-6 text-black" />
        </span>
        <p className="text-lg font-extrabold text-black">{t('appsPage.heroTitle', 'More to do with Vaquita')}</p>
        <p className="text-sm text-black/60">
          {t('appsPage.heroBody', 'We are building fun things around your savings. They will show up here.')}
        </p>
      </div>

      <ul className="divide-y divide-black/5 rounded-2xl bg-white px-4">
        {soon.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex items-center gap-4 py-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/20">
              <Icon className="h-5 w-5 text-black" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-base font-bold text-black">{title}</span>
              <span className="text-sm text-black/60">{body}</span>
            </span>
            <span className="shrink-0 rounded-full bg-black/5 px-2.5 py-1 text-[11px] font-bold text-black/50">
              {t('shell.nav.soon', 'Soon')}
            </span>
          </li>
        ))}
      </ul>
    </PageLayout>
  );
}
