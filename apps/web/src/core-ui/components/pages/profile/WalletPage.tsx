'use client';

import { usePollar } from '@pollar/react';
import { toast } from '@heroui/react';
import Image from 'next/image';
import React, { ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheck, FiCopy, FiDownload, FiEye, FiSend, FiShield } from 'react-icons/fi';
import { truncateMiddle } from '../../../helpers';
import { useConfigStore } from '../../../stores';
import { PageLayout } from '../../molecules';

const LogoByType: Record<string, ReactNode> = {
  Stellar: <Image src="/chains/stellar.png" alt="Stellar" width={20} height={20} className="rounded-sm" />,
};

export function WalletPage() {
  const { t } = useTranslation();
  const { walletAddress, network } = useConfigStore();
  const { openWalletBalanceModal, openSendModal, openReceiveModal } = usePollar();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      toast.success(t('wallet.page.addressCopied'));
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      toast.danger(t('wallet.page.copyError'), { description: (e as { message?: string })?.message ?? '' });
    }
  };

  const networkLogo = network?.type ? LogoByType[network.type] : null;

  return (
    <PageLayout title={t('wallet.page.title')} backHref="/profile/settings">
      <section className="rounded-lg border border-black border-b-2 bg-white p-4 sm:p-6 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            {networkLogo}
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">
              {network?.networkName ?? t('wallet.page.network')}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 mb-1">{t('wallet.page.address')}</p>
              <p className="text-sm font-mono text-black truncate">
                {walletAddress ? truncateMiddle(walletAddress, 12, 8) : '—'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopy}
                disabled={!walletAddress}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border border-black border-b-2 bg-[#DDF4FF] text-black text-sm font-semibold hover:bg-[#c4ecff] transition disabled:opacity-50"
              >
                {copied ? <FiCheck className="w-4 h-4" /> : <FiCopy className="w-4 h-4" />}
                {copied ? t('wallet.page.copied') : t('wallet.page.copyAddress')}
              </button>
              <button
                type="button"
                onClick={openWalletBalanceModal}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border border-black border-b-2 bg-white text-black text-sm font-semibold hover:bg-[#F5FBFF] transition"
              >
                <FiEye className="w-4 h-4" />
                {t('wallet.page.balance')}
              </button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={openReceiveModal}
            className="relative w-full flex flex-col items-center justify-center gap-2 rounded-lg border border-black border-b-2 bg-white px-3 py-6 text-black hover:bg-[#F5FBFF] transition"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#DDF4FF] border border-[#84D8FF]">
              <FiDownload className="w-6 h-6" />
            </span>
            <span className="text-sm font-semibold">{t('wallet.page.receive')}</span>
            <span className="text-xs text-gray-500">{t('wallet.page.getAssets')}</span>
          </button>
          <button
            type="button"
            onClick={openSendModal}
            className="relative w-full flex flex-col items-center justify-center gap-2 rounded-lg border border-black border-b-2 bg-white px-3 py-6 text-black hover:bg-[#F5FBFF] transition"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#DDF4FF] border border-[#84D8FF]">
              <FiSend className="w-6 h-6" />
            </span>
            <span className="text-sm font-semibold">{t('wallet.page.send')}</span>
            <span className="text-xs text-gray-500">{t('wallet.page.transferAssets')}</span>
          </button>
        </section>

        <section className="rounded-lg border border-black border-b-2 bg-white p-4 sm:p-5 flex items-start gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#FFF7E6] border border-primary text-black shrink-0">
            <FiShield />
          </span>
          <div className="text-sm">
            <p className="font-semibold text-black">{t('wallet.page.selfCustodyTitle')}</p>
            <p className="text-gray-600 mt-0.5">
              {t('wallet.page.selfCustodyDescription')}
            </p>
          </div>
        </section>
    </PageLayout>
  );
}
