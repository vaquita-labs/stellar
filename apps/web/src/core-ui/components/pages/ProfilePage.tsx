'use client';

import { logoutAll } from '@/helpers';
import { Avatar, Badge, Button, Card, CardBody, Chip, Tooltip } from '@heroui/react';
import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import { FiBell, FiChevronLeft, FiEdit3, FiLogOut, FiSettings, FiUserPlus } from 'react-icons/fi';
import { truncateMiddle } from '../../helpers';
import { useProfileData } from '../../hooks';
import { useNetworkConfigStore } from '../../stores';
import { EditProfileModal } from '../organisms';
import Image from 'next/image';

export function ProfilePage() {
  const { walletAddress, network, reset } = useNetworkConfigStore();
  const { data, isLoading } = useProfileData();
  const profileNickname = data?.nickname ?? '';
  const networkLabel = network?.name || 'Base';
  const [nickname, setNickname] = useState<string>('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  useEffect(() => {
    setNickname(profileNickname);
  }, [profileNickname]);

  const addressDisplay = useMemo(() => (walletAddress ? truncateMiddle(walletAddress, 8, 6) : ''), [walletAddress]);

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

  const handleEditSuccess = (nickname: string) => {
    setNickname(nickname);
  };

  const ProfileHeader = () => (
    <Card className="bg-background border-none shadow-none">
      <CardBody className="flex flex-col gap-2  p-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/home" aria-label="Back to home">
              <Image src="/icons/arrow-back.svg" alt="arrow back" width={24} height={24} />
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold md:text-3xl">Profile</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/settings" aria-label="Settings">
              <Image src="/icons/settings.svg" alt="settings" width={24} height={24} />
            </Link>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          <Badge
            placement="bottom-right"
            isOneChar
            content={<Image src="/chains/base_400x400.jpg" alt="badge" width={20} height={20} />}
          >
            <Avatar
              src="/vaquita_working.jpg"
              className="h-24 w-24 border-2 border-white shadow-lg dark:border-default-100"
              name={isLoading ? 'Loading...' : `@${nickname}` || 'Vaquita'}
            />
          </Badge>
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-md font-semibold text-gray-900 dark:text-gray-50">
              {isLoading ? 'Loading...' : nickname ? `@${nickname}` : addressDisplay}
            </p>
          </div>

          <div className="flex w-full items-center gap-3 flex-row md:justify-center">
            <Tooltip content="Friends feature is coming soon">
              <Button
                variant="flat"
                className="w-full rounded-lg bg-gray-100 px-5 text-sm font-semibold text-gray-500 hover:bg-gray-200 md:w-auto dark:bg-default-100 dark:text-gray-400 dark:hover:bg-default-200"
                startContent={<FiUserPlus />}
                isDisabled
              >
                Add friends
              </Button>
            </Tooltip>
            <Button
              variant="flat"
              startContent={<FiEdit3 />}
              onPress={() => setIsEditModalOpen(true)}
              className="w-full rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 md:w-auto dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              size="sm"
              isDisabled={isLoading}
            >
              Edit profile
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );

  const EmptyState = () => (
    <Card className="border border-default-200/60 bg-white/80 shadow-sm backdrop-blur dark:border-default-100/40 dark:bg-default-50/80">
      <CardBody className="flex flex-col gap-6 p-10 text-center">
        <div className="flex items-center justify-between">
          <Link href="/home" aria-label="Back to home">
            <Image src="/icons/arrow-back.svg" alt="arrow back" width={24} height={24} />
          </Link>
        </div>
        <div className="space-y-3">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-50">Connect your wallet</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Access your profile, metrics, and future achievements by connecting your wallet on Base.
          </p>
        </div>

        {/* <p className="text-xs text-gray-400">By continuing you accept our Terms of Service and Privacy Policy.</p> */}
      </CardBody>
    </Card>
  );

  return (
    <div className="h-full">
      <div className="mx-auto flex w-full h-full max-w-5xl flex-col gap-4 px-4 py-6">
        {walletAddress ? (
          <div className=" h-full flex flex-col justify-between">
            <ProfileHeader />

            <div className="flex justify-center">
              <Button
                variant="flat"
                color="danger"
                startContent={<FiLogOut className="h-4 w-4" />}
                onPress={handleDisconnect}
                isLoading={isDisconnecting}
                isDisabled={isDisconnecting}
                className="w-full max-w-sm rounded-xl border border-red-200/70 bg-red-50 text-sm font-semibold text-red-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
              >
                Disconnect wallet
              </Button>
            </div>
          </div>
        ) : (
          <EmptyState />
        )}
      </div>

      <EditProfileModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        currentNickname={nickname}
        onSuccess={handleEditSuccess}
      />
    </div>
  );
}
