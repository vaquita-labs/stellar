'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiBell, FiMail, FiTrendingUp, FiUsers, FiZap } from 'react-icons/fi';
import { PageLayout } from '../../molecules';

type ToggleKey = 'push' | 'email' | 'deposits' | 'streaks' | 'friends';

const SECTIONS: {
  id: string;
  title: string;
  items: { key: ToggleKey; icon: React.ReactNode; title: string; description: string }[];
}[] = [
  {
    id: 'channels',
    title: 'Channels',
    items: [
      { key: 'push', icon: <FiBell />, title: 'Push notifications', description: 'Receive alerts on this device.' },
      { key: 'email', icon: <FiMail />, title: 'Email updates', description: 'Get a weekly summary by email.' },
    ],
  },
  {
    id: 'activity',
    title: 'Activity',
    items: [
      { key: 'deposits', icon: <FiTrendingUp />, title: 'Deposits & yield', description: 'When your savings earn rewards.' },
      { key: 'streaks', icon: <FiZap />, title: 'Streak reminders', description: 'Daily reminder to keep your streak.' },
      { key: 'friends', icon: <FiUsers />, title: 'Friends activity', description: 'Friends joining or saving.' },
    ],
  },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-black border-b-2 transition-colors ${
        checked ? 'bg-primary' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white border border-black transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export function NotificationsPage() {
  const { t } = useTranslation();
  const [values, setValues] = useState<Record<ToggleKey, boolean>>({
    push: true,
    email: false,
    deposits: true,
    streaks: true,
    friends: false,
  });

  const setValue = (key: ToggleKey, v: boolean) => setValues((prev) => ({ ...prev, [key]: v }));

  return (
    <PageLayout
      title={t('profilePages.notifications.title', 'Notifications')}
      backHref="/profile/settings"
      rightSlot={
        <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider bg-primary text-black border border-black border-b-2 rounded-full px-2 py-0.5">
          {t('common.soon')}
        </span>
      }
    >
      {SECTIONS.map((section) => (
          <section key={section.id} className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 px-1">
              {t(`profilePages.notifications.sections.${section.id}.title`, section.title)}
            </h2>
            <ul className="rounded-lg border border-black border-b-2 bg-white overflow-hidden divide-y divide-gray-200">
              {section.items.map(({ key, icon, title, description }) => (
                <li key={key} className="flex items-center justify-between gap-3 px-4 py-3.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#DDF4FF] border border-[#84D8FF] text-black shrink-0">
                      {icon}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-black truncate">
                        {t(`profilePages.notifications.items.${key}.title`, title)}
                      </p>
                      <p className="text-xs text-gray-600 truncate">
                        {t(`profilePages.notifications.items.${key}.description`, description)}
                      </p>
                    </div>
                  </div>
                  <Toggle checked={values[key]} onChange={(v) => setValue(key, v)} />
                </li>
              ))}
            </ul>
          </section>
        ))}

      <p className="text-xs text-gray-500 text-center">
        {t('profilePages.notifications.localNote', 'Preferences are stored locally for now. Backend syncing coming soon.')}
      </p>
    </PageLayout>
  );
}
