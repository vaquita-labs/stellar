'use client';

import { toast } from '@heroui/react';
import Image from 'next/image';
import React, { ReactNode, useState } from 'react';
import { FiCheck, FiCopy, FiDownload, FiSend, FiShield } from 'react-icons/fi';
import { truncateMiddle } from '../../../helpers';
import { useNetworkConfigStore } from '../../../stores';
import { ProfileSubHeader } from './ProfileSubHeader';

const LogoByType: Record<string, ReactNode> = {
  EVM: <Image src="/chains/base_400x400.jpg" alt="EVM" width={20} height={20} className="rounded-sm" />,
  Stellar: <Image src="/chains/stellar.png" alt="Stellar" width={20} height={20} className="rounded-sm" />,
};

export function WalletPage() {  
  const { walletAddress, network } = useNetworkConfigStore();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      toast.success('Address copied');
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      toast.danger('Could not copy', { description: (e as { message?: string })?.message ?? '' });
    }
  };

  const networkLogo = network?.type ? LogoByType[network.type] : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-8 flex flex-col gap-6">
        <ProfileSubHeader title="Wallet" />

        <section className="rounded-lg border border-black border-b-2 bg-white p-4 sm:p-6 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            {networkLogo}
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">
              {network?.name ?? 'Network'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 mb-1">Address</p>
              <p className="text-sm font-mono text-black truncate">
                {walletAddress ? truncateMiddle(walletAddress, 12, 8) : '—'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!walletAddress}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border border-black border-b-2 bg-[#DDF4FF] text-black text-sm font-semibold hover:bg-[#c4ecff] transition disabled:opacity-50 shrink-0"
            >
              {copied ? <FiCheck className="w-4 h-4" /> : <FiCopy className="w-4 h-4" />}
              {copied ? 'Copied' : 'Copy address'}
            </button>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled
            className="relative w-full flex flex-col items-center justify-center gap-2 rounded-lg border border-black border-b-2 bg-white px-3 py-6 text-black opacity-70 cursor-not-allowed"
          >
            <span className="absolute top-2 right-2 text-[10px] font-bold uppercase tracking-wide bg-primary text-black border border-black rounded-sm px-1.5 py-0.5">
              Soon
            </span>
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#DDF4FF] border border-[#84D8FF]">
              <FiDownload className="w-6 h-6" />
            </span>
            <span className="text-sm font-semibold">Receive</span>
            <span className="text-xs text-gray-500">Get assets</span>
          </button>
          <button
            type="button"
            disabled
            className="relative w-full flex flex-col items-center justify-center gap-2 rounded-lg border border-black border-b-2 bg-white px-3 py-6 text-black opacity-70 cursor-not-allowed"
          >
            <span className="absolute top-2 right-2 text-[10px] font-bold uppercase tracking-wide bg-primary text-black border border-black rounded-sm px-1.5 py-0.5">
              Soon
            </span>
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#DDF4FF] border border-[#84D8FF]">
              <FiSend className="w-6 h-6" />
            </span>
            <span className="text-sm font-semibold">Send</span>
            <span className="text-xs text-gray-500">Transfer assets</span>
          </button>
        </section>

        <section className="rounded-lg border border-black border-b-2 bg-white p-4 sm:p-5 flex items-start gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#FFF7E6] border border-primary text-black shrink-0">
            <FiShield />
          </span>
          <div className="text-sm">
            <p className="font-semibold text-black">Self-custody wallet</p>
            <p className="text-gray-600 mt-0.5">
              Vaquita never holds your keys. On-chain transfers will be enabled in an upcoming release.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
