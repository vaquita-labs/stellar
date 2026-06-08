'use client';

import { Switch } from '@heroui/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FiBell,
  FiChevronRight,
  FiCreditCard,
  FiEdit3,
  FiEyeOff,
  FiHelpCircle,
  FiLogOut,
  FiMessageCircle,
  FiSliders,
  FiUserPlus,
} from 'react-icons/fi';
import { useLogout, useProfileData } from '../../../hooks';
import { usePrivacyStore, useConfigStore } from '../../../stores';
import { Button } from '../../atoms';
import { ConfirmDialog } from '../../molecules';
import { PRIVACY_LAST_UPDATED, TERMS_LAST_UPDATED } from '../legal';

type LinkRow = {
  kind: 'link';
  key: string;
  icon: ReactNode;
  label: string;
  description?: string;
  href?: string;
  onPress?: () => void;
  disabled?: boolean;
  badge?: string;
};

type SwitchRow = {
  kind: 'switch';
  key: string;
  icon: ReactNode;
  label: string;
  description?: string;
  value: boolean;
  onChange: (next: boolean) => void;
};

type Row = LinkRow | SwitchRow;

function RowShell({
  icon,
  label,
  description,
  badge,
  trailing,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  description?: string;
  badge?: string;
  trailing: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-4 transition ${
        disabled ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#DDF4FF] border border-[#84D8FF] text-black shrink-0">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[15px] font-bold text-black truncate">{label}</p>
            {badge && (
              <span className="text-[10px] font-bold uppercase tracking-wide bg-primary text-black border border-black rounded-sm px-1.5 py-0.5">
                {badge}
              </span>
            )}
          </div>
          {description && (
            <p className="text-xs text-gray-600 truncate mt-0.5">{description}</p>
          )}
        </div>
      </div>
      <div className="shrink-0">{trailing}</div>
    </div>
  );
}

function SettingsRow({ row }: { row: Row }) {
  if (row.kind === 'switch') {
    return (
      <label className="block cursor-pointer hover:bg-[#FFF7E6] transition">
        <RowShell
          icon={row.icon}
          label={row.label}
          description={row.description}
          trailing={
            <Switch
              isSelected={row.value}
              onChange={(checked) => row.onChange(checked)}
              aria-label={row.label}
            />
          }
        />
      </label>
    );
  }

  const shell = (
    <RowShell
      icon={row.icon}
      label={row.label}
      description={row.description}
      badge={row.badge}
      disabled={row.disabled}
      trailing={<FiChevronRight className="text-gray-500" />}
    />
  );

  if (row.disabled) {
    return <div aria-disabled>{shell}</div>;
  }
  if (row.href) {
    return (
      <Link href={row.href} className="block hover:bg-[#FFF7E6] transition">
        {shell}
      </Link>
    );
  }
  return (
    <button type="button" onClick={row.onPress} className="block w-full text-left hover:bg-[#FFF7E6] transition">
      {shell}
    </button>
  );
}

function Section({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-extrabold uppercase tracking-wider text-gray-500 px-1">{title}</h2>
      <ul className="rounded-2xl border border-black border-b-2 bg-white overflow-hidden divide-y divide-gray-200">
        {rows.map((row) => (
          <li key={row.key}>
            <SettingsRow row={row} />
          </li>
        ))}
      </ul>
    </section>
  );
}

const formatDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

export function SettingsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const logout = useLogout();
  const { reset } = useConfigStore();
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const hideBalance = usePrivacyStore((s) => s.hideBalance);

  const handleDisconnect = async () => {
    if (isDisconnecting) return;
    setIsDisconnecting(true);
    try {
      await logout();
      reset?.(true);
    } catch (error) {
      console.error('Failed to disconnect wallet', error);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const accountRows: Row[] = [
    {
      kind: 'link',
      key: 'preferences',
      icon: <FiSliders />,
      label: t('profilePages.settings.preferences', 'Preferences'),
      description: t('profilePages.settings.preferencesDesc', 'Language, currency and display options.'),
      href: '/profile/preferences',
    },
    {
      kind: 'link',
      key: 'profile',
      icon: <FiEdit3 />,
      label: t('profilePages.settings.profile', 'Profile'),
      description: t('profilePages.settings.profileDesc', 'Edit your nickname and avatar.'),
      href: '/profile/edit',
    },
    {
      kind: 'link',
      key: 'notifications',
      icon: <FiBell />,
      label: t('profilePages.settings.notifications', 'Notifications'),
      description: t('profilePages.settings.notificationsDesc', 'Manage push and email alerts.'),
      href: '/profile/notifications',
      badge: t('common.soon')
    },
    {
      kind: 'link',
      key: 'wallet',
      icon: <FiCreditCard />,
      label: t('profilePages.settings.wallet', 'Wallet'),
      description: t('profilePages.settings.walletDesc', 'View address, send and receive funds.'),
      href: '/profile/wallet',
    },
    {
      kind: 'link',
      key: 'privacy',
      icon: <FiEyeOff />,
      label: t('profilePages.settings.privacy', 'Privacy settings'),
      description: hideBalance
        ? t('profilePages.settings.privacyDescHidden', 'Balance hidden on this device.')
        : t('profilePages.settings.privacyDesc', 'Hide your balance on the profile and home screens.'),
      href: '/profile/privacy-settings',
      badge: t('common.soon')
    },
  ];

  const supportRows: Row[] = [
    {
      kind: 'link',
      key: 'help',
      icon: <FiHelpCircle />,
      label: t('profilePages.settings.help', 'Help center'),
      description: t('profilePages.settings.helpDesc', 'FAQ and account support.'),
      href: '/profile/help',
      badge: t('common.soon'),
    },
    {
      kind: 'link',
      key: 'feedback',
      icon: <FiMessageCircle />,
      label: t('profilePages.settings.feedback', 'Feedback'),
      description: t('profilePages.settings.feedbackDesc', 'Tell us what you think.'),
      href: '/profile/feedback',
      badge: t('common.soon'),
    },
  ];

  return (
    <>
      <div className="h-full overflow-y-auto bg-background">
        <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-5 sm:py-6 flex flex-col gap-5">
          {/* Duolingo-style header: muted title centered, Done on the right */}
          <header className="relative flex items-center justify-center min-h-10 border-b border-black/10 pb-3">
            <h1 className="text-base sm:text-lg font-bold text-gray-500 tracking-wide uppercase">
              {t('profilePages.settings.title', 'Settings')}
            </h1>
            <button
              type="button"
              onClick={() => router.push('/profile')}
              className="absolute right-0 text-sm font-extrabold text-primary hover:text-primary/80 transition uppercase tracking-wider bg-transparent"
            >
              {t('common.done')}
            </button>
          </header>

          <Section title={t('profilePages.settings.accountSection', 'Account')} rows={accountRows} />
          <Section title={t('profilePages.settings.supportSection', 'Support')} rows={supportRows} />

          {/* Sign out */}
          <div className="pt-1">
            <Button
              type="white"
              startContent={<FiLogOut className="h-4 w-4" />}
              onPress={() => setConfirmLogout(true)}
              isDisabled={isDisconnecting}
              wFull
            >
              {t('profilePages.settings.signOut', 'Sign out')}
            </Button>
          </div>

          {/* Footer: legal links in primary color */}
          <div className="flex flex-col items-start gap-2 pt-3 pb-6">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Link
                href="/terms"
                className="text-xs font-extrabold uppercase tracking-wider text-primary hover:text-primary/80 transition"
              >
                {t('profilePages.settings.terms', 'Terms')}
              </Link>
              <Link
                href="/privacy"
                className="text-xs font-extrabold uppercase tracking-wider text-primary hover:text-primary/80 transition"
              >
                {t('profilePages.settings.privacyPolicy', 'Privacy policy')}
              </Link>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmLogout}
        onOpenChange={setConfirmLogout}
        title={t('profilePages.settings.signOutConfirmTitle', 'Sign out?')}
        description={t('profilePages.settings.signOutConfirmDesc', 'Are you sure you want to sign out?')}
        icon={<FiLogOut className="h-5 w-5" />}
        status="danger"
        confirmLabel={t('profilePages.settings.signOut', 'Sign out')}
        onConfirm={handleDisconnect}
        isConfirming={isDisconnecting}
      />
    </>
  );
}
