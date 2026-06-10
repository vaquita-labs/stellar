'use client';

import { toast } from '@heroui/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiBell, FiLoader, FiMail, FiTrendingUp, FiUsers, FiZap } from 'react-icons/fi';
import { useProfileData, useRestProfile } from '../../../hooks';
import { useConfigStore } from '../../../stores';
import { DEFAULT_NOTIFICATION_PREFERENCES, NotificationPreferenceKey } from '../../../types';
import { PageLayout } from '../../molecules';

const SECTIONS: {
  id: string;
  title: string;
  items: { key: NotificationPreferenceKey; icon: React.ReactNode; title: string; description: string }[];
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

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-black border-b-2 transition-colors ${
        checked ? 'bg-primary' : 'bg-gray-200'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
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
  const { walletAddress } = useConfigStore();
  const { data, isLoading, refetch } = useProfileData();
  const { saveNotificationPreferences } = useRestProfile();

  const [values, setValues] = useState(DEFAULT_NOTIFICATION_PREFERENCES);
  const [saving, setSaving] = useState<NotificationPreferenceKey | null>(null);

  // Hydrate from the saved profile preferences once (and after each refetch).
  useEffect(() => {
    if (data?.notificationPreferences) setValues(data.notificationPreferences);
  }, [data?.notificationPreferences]);

  // The email channel needs an address to send to: locked until the user adds
  // one on the Edit profile page.
  const emailLocked = !isLoading && !data?.email;
  const emailLockedMessage = t(
    'profilePages.notifications.emailRequired',
    'Add your email in Edit profile to enable this.'
  );

  const handleToggle = async (key: NotificationPreferenceKey, value: boolean) => {
    if (!walletAddress || isLoading || saving) return;
    if (key === 'email' && emailLocked) {
      // The toggle is locked; surface the hover hint as a toast for touch devices.
      toast.warning(emailLockedMessage, { timeout: 3000 });
      return;
    }
    const prev = values;
    setValues({ ...prev, [key]: value }); // optimistic; reverted on failure
    setSaving(key);
    try {
      const { success, message } = await saveNotificationPreferences({ [key]: value });
      if (success) {
        refetch();
      } else {
        setValues(prev);
        toast.danger(t('profile.preferences.updateError'), { description: message, timeout: 4000 });
      }
    } catch (error) {
      setValues(prev);
      toast.danger(t('profile.preferences.updateError'), {
        description: (error as { message?: string })?.message ?? '',
        timeout: 4000,
      });
    } finally {
      setSaving(null);
    }
  };

  return (
    <PageLayout title={t('profilePages.notifications.title', 'Notifications')} backHref="/profile/settings">
      {SECTIONS.map((section) => (
          <section key={section.id} className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 px-1">
              {t(`profilePages.notifications.sections.${section.id}.title`, section.title)}
            </h2>
            <ul className="rounded-lg border border-black border-b-2 bg-white overflow-hidden divide-y divide-gray-200">
              {section.items.map(({ key, icon, title, description }) => {
                const locked = key === 'email' && emailLocked;
                return (
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
                    <div className="relative group flex items-center gap-2 shrink-0">
                      {saving === key && <FiLoader className="animate-spin text-gray-400" />}
                      <Toggle
                        checked={values[key]}
                        disabled={locked || !walletAddress || isLoading || saving !== null}
                        onChange={(v) => handleToggle(key, v)}
                      />
                      {locked && (
                        <span
                          role="tooltip"
                          className="pointer-events-none absolute right-0 bottom-full mb-2 w-max max-w-[220px] rounded-md border border-black border-b-2 bg-white px-3 py-2 text-xs font-semibold text-black shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        >
                          {emailLockedMessage}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
    </PageLayout>
  );
}
