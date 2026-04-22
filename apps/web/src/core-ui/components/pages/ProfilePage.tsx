'use client';

import { logoutAll } from '@/helpers';
import { Avatar, Card, Spinner } from '@heroui/react';
import Image from 'next/image';
import Link from 'next/link';
import React, { ReactNode, useMemo, useState } from 'react';
import { FiEdit3, FiLogOut, FiUserPlus } from 'react-icons/fi';
import { truncateMiddle } from '../../helpers';
import { useProfileData } from '../../hooks';
import { useNetworkConfigStore } from '../../stores';
import { Button, T } from '../atoms';
import { Badge } from '../Badge';
import { EditProfileModal } from '../organisms';

const LogoByType: Record<string, ReactNode> = {
  EVM: <Image src="/chains/base_400x400.jpg" alt="EVM" width={24} height={24} className="rounded-sm" />,
  Stellar: <Image src="/chains/stellar.png" alt="Stellar" width={24} height={24} className="rounded-sm" />,
};

export function ProfilePage() {
  const { walletAddress, reset } = useNetworkConfigStore();
  const { data, isLoading, isRefetching } = useProfileData();
  const loading = isLoading || isRefetching;
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const { network } = useNetworkConfigStore();

  const addressDisplay = useMemo(() => (walletAddress ? truncateMiddle(walletAddress, 8, 6) : ''), [walletAddress]);
  const profileNickname = data?.nickname || addressDisplay;
  const currentNickname = (data?.nickname ?? '').trim();
  const displayName = useMemo(() => {
    if (isLoading) return 'Cargando...';
    if (currentNickname) return `@${currentNickname}`;
    return truncateMiddle(walletAddress) || 'Vaquita';
  }, [currentNickname, isLoading, walletAddress]);

  const badgeLogo = network?.type ? (LogoByType[network.type] ?? LogoByType.EVM) : LogoByType.EVM;

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

  const ProfileHeader = () => (
    <div className="flex flex-col gap-2 p-0">
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
        {loading ? (
          <Spinner size="lg" color="accent" />
        ) : (
          <>
            <Badge placement="bottom-right" isOneChar content={badgeLogo}>
              <Avatar
                size="lg"
                className="border-2 border-white shadow-lg dark:border-default-100"
              >
                <Avatar.Image src="/vaquita_working.jpg" />
                <Avatar.Fallback>{displayName.slice(0, 2).toUpperCase()}</Avatar.Fallback>
              </Avatar>
            </Badge>
            <div className="flex flex-col items-center gap-4 text-center">
              <p className="text-md font-semibold text-gray-900 dark:text-gray-50">
                {loading ? 'Loading...' : profileNickname}
              </p>
            </div>
          </>
        )}

        <div className="flex w-full items-center gap-4 flex-row md:justify-center">
          <Badge content="Soon">
            <Button startContent={<FiUserPlus />} isDisabled>
              Add friends
            </Button>
          </Badge>
          <Button
            type="secondary"
            startContent={<FiEdit3 />}
            onPress={() => setIsEditModalOpen(true)}
            isDisabled={loading}
          >
            <T>Edit profile</T>
          </Button>
        </div>
      </div>
    </div>
  );

  const EmptyState = () => (
    <Card className="border border-default-200/60 bg-white/80 shadow-sm backdrop-blur dark:border-default-100/40 dark:bg-default-50/80">
      <Card.Content className="flex flex-col gap-6 p-10 text-center">
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
      </Card.Content>
    </Card>
  );

  return (
    <div className="h-full">
      <div className="mx-auto flex w-full h-full max-w-5xl flex-col gap-4 px-4 py-6">
        {walletAddress ? (
          <div className=" h-full flex flex-col justify-between">
            <ProfileHeader />

            <div className="flex justify-center mb-20">
              <Button
                type="danger"
                startContent={<FiLogOut className="h-4 w-4" />}
                onPress={handleDisconnect}
                isLoading={isDisconnecting}
                isDisabled={isDisconnecting}
                wFull
                className="max-w-sm"
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
        currentNickname={profileNickname}
      />
    </div>
  );
}
