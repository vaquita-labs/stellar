'use client';

import { logoutAll } from '@/helpers';
import { Card } from '@heroui/react';
import Image from 'next/image';
import Link from 'next/link';
import React, { ReactNode, useState } from 'react';
import {
  FiBell,
  FiChevronRight,
  FiCreditCard,
  FiEdit3,
  FiHelpCircle,
  FiInfo,
  FiLogOut,
  FiShield,
  FiUserPlus,
} from 'react-icons/fi';
import { useProfileData } from '../../hooks';
import { useNetworkConfigStore } from '../../stores';
import { Button } from '../atoms';
import { ConfirmDialog } from '../molecules';

type Row = {
  key: string;
  icon: ReactNode;
  label: string;
  description?: string;
  href?: string;
  onPress?: () => void;
  disabled?: boolean;
  badge?: string;
};

function SettingsRow({ icon, label, description, href, onPress, disabled, badge }: Omit<Row, 'key'>) {
  const inner = (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-3.5 transition ${
        disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-[#FFF7E6] cursor-pointer'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#DDF4FF] border border-[#84D8FF] text-black shrink-0">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-black truncate">{label}</p>
            {badge && (
              <span className="text-[10px] font-bold uppercase tracking-wide bg-primary text-black border border-black rounded-sm px-1.5 py-0.5">
                {badge}
              </span>
            )}
          </div>
          {description && <p className="text-xs text-gray-600 truncate mt-0.5">{description}</p>}
        </div>
      </div>
      <FiChevronRight className="text-gray-500 shrink-0" />
    </div>
  );

  if (disabled) {
    return <div aria-disabled>{inner}</div>;
  }
  if (href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onPress} className="block w-full text-left">
      {inner}
    </button>
  );
}

function Section({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 px-1">{title}</h2>
      <ul className="rounded-lg border border-black border-b-2 bg-white overflow-hidden divide-y divide-gray-200">
        {rows.map((row) => (
          <li key={row.key}>
            <SettingsRow
              icon={row.icon}
              label={row.label}
              description={row.description}
              href={row.href}
              onPress={row.onPress}
              disabled={row.disabled}
              badge={row.badge}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ProfilePage() {
  const { walletAddress, reset } = useNetworkConfigStore();
  const { isLoading, isRefetching } = useProfileData();
  const loading = isLoading || isRefetching;
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const handleDisconnect = async () => {
    if (isDisconnecting) return;
    setIsDisconnecting(true);
    try {
      await logoutAll();
      reset?.(true);
    } catch (error) {
      console.error('Failed to disconnect wallet', error);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const sections: { title: string; rows: Row[] }[] = [
    {
      title: 'Account',
      rows: [
        {
          key: 'edit',
          icon: <FiEdit3 />,
          label: 'Edit profile',
          description: 'Update your nickname.',
          href: '/profile/edit',
          disabled: loading,
        },
        {
          key: 'friends',
          icon: <FiUserPlus />,
          label: 'Friends',
          description: 'Invite people to save together.',
          href: '/profile/friends',
          badge: 'Soon',
        },
      ],
    },
    {
      title: 'Finance',
      rows: [
        {
          key: 'wallet',
          icon: <FiCreditCard />,
          label: 'Wallet',
          description: 'View address, send & receive.',
          href: '/profile/wallet',
        },
      ],
    },
    {
      title: 'Preferences',
      rows: [
        {
          key: 'notifications',
          icon: <FiBell />,
          label: 'Notifications',
          description: 'Manage push and email alerts.',
          href: '/profile/notifications',
        },
      ],
    },
    {
      title: 'Support',
      rows: [
        {
          key: 'security',
          icon: <FiShield />,
          label: 'Privacy & security',
          description: 'Account safety options.',
          disabled: true,
          badge: 'Soon',
        },
        {
          key: 'help',
          icon: <FiHelpCircle />,
          label: 'Help center',
          description: 'FAQ and contact.',
          disabled: true,
          badge: 'Soon',
        },
        {
          key: 'about',
          icon: <FiInfo />,
          label: 'About Vaquita',
          description: 'Version & legal.',
          disabled: true,
        },
      ],
    },
  ];

  if (!walletAddress) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-8">
          <Card className="border border-default-200/60 bg-white/80 shadow-sm backdrop-blur dark:border-default-100/40 dark:bg-default-50/80">
            <Card.Content className="flex flex-col gap-6 p-6 sm:p-10 text-center">
              <div className="flex items-center justify-between">
                <Link href="/home" aria-label="Back to home">
                  <Image src="/icons/arrow-back.svg" alt="arrow back" width={24} height={24} />
                </Link>
              </div>
              <div className="space-y-3">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-50">
                  Connect your wallet
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Access your profile, metrics, and future achievements by connecting your wallet.
                </p>
              </div>
            </Card.Content>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-8 flex flex-col gap-6 pb-12">
        {/* Header */}
        <div className="relative flex items-center justify-center h-10">
          <Link
            href="/home"
            aria-label="Back to home"
            className="absolute left-0 flex h-10 w-10 items-center justify-center"
          >
            <Image src="/icons/arrow-back.svg" alt="back" width={28} height={28} />
          </Link>
          <h1 className="text-lg sm:text-xl font-semibold text-black">Profile</h1>
        </div>

        {sections.map((s) => (
          <Section key={s.title} title={s.title} rows={s.rows} />
        ))}

        <div className="pt-2">
          <Button
            type="white"
            startContent={<FiLogOut className="h-4 w-4" />}
            onPress={() => setConfirmLogout(true)}
            isDisabled={isDisconnecting}
            wFull
          >
            Logout
          </Button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmLogout}
        onOpenChange={setConfirmLogout}
        title="Log out?"
        description="Are you sure you want to log out?"
        icon={<FiLogOut className="h-5 w-5" />}
        status="danger"
        confirmLabel="Log out"
        onConfirm={handleDisconnect}
        isConfirming={isDisconnecting}
      />
    </div>
  );
}
