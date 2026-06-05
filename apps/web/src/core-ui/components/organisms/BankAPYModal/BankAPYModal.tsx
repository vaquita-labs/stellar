'use client';

import { VaquitaDepositCard } from '@/core-ui/components/home/VaquitaDepositCard';
import { getDepositsData } from '@/core-ui/helpers/deposits';
import { isStellarNetwork } from '@/networks/stellar/helpers';
import { Spinner } from '@heroui/react';
import Image from 'next/image';
import { useState } from 'react';
import { useApyByLockPeriod, useDepositsComplete } from '../../../hooks';
import { useConfigStore } from '../../../stores';
import { DepositResponseDTO } from '../../../types';
import { AppModal } from '../../molecules/AppModal';
import { VaquitaModalContent } from '../VaquitaModal';
import { BankAPYModalProps } from './types';

export function BankAPYModal({ open, onOpenChange, injectedDeposits, onVaquitaSelect }: BankAPYModalProps) {
  const { network, lockPeriod, walletAddress, token } = useConfigStore();
  const { data: dataApy, isLoading: isLoadingApy } = useApyByLockPeriod(lockPeriod, token?.symbol ?? '');
  const { data: depositsData, isLoading: isLoadingDeposits } = useDepositsComplete(walletAddress);

  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [selectedVaquita, setSelectedVaquita] = useState<DepositResponseDTO | null>(null);

  // En modo tutorial mostramos un depósito inyectado en vez de los reales.
  const sourceDeposits = injectedDeposits ?? depositsData?.deposits ?? [];

  const protocolApy = dataApy?.protocolApy ?? 0;
  const vaquitaApy = dataApy?.vaquitaApy ?? 0;
  const networkLabel = dataApy?.lendingMarketName ?? '';
  const totalApy = vaquitaApy + protocolApy;
  const hasProtocolApy = !!networkLabel && protocolApy >= 0;

  const { deposits, activeDeposits, activeDepositsTotalAmount } = getDepositsData(sourceDeposits);
  const tokenSymbol = deposits[0]?.tokenSymbol ?? token?.symbol ?? 'USDC';
  const estimatedAnnualReturn = activeDepositsTotalAmount * (totalApy / 100);
  const totalEstimatedEarnings = activeDeposits.reduce(
    (acc, d) => acc + (d.vaquitaInterest ?? 0) + (d.protocolInterest ?? 0) + (d.blendInterest ?? 0),
    0,
  );

  // Con depósitos inyectados (tutorial) no esperamos a las queries reales.
  const isLoading = !injectedDeposits && (isLoadingApy || isLoadingDeposits);

  return (
    <>
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Bank Rewards"
      titleIcon="/icons/medal.svg"
      titleIconAlt="rewards"
      size="lg"
    >
      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <Spinner size="lg" color="accent" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="border border-success border-b-2 rounded-xl bg-success/10 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowBreakdown((v) => !v)}
              className="w-full flex items-center justify-between gap-3 p-4 hover:bg-success/5 transition-colors"
            >
              <div className="text-left">
                <p className="text-xs text-success/80 font-semibold uppercase tracking-wide">
                  Estimated annual return
                </p>
                <p className="text-3xl font-bold text-success leading-tight">
                  {estimatedAnnualReturn.toFixed(2)}
                  <span className="text-base ml-1 font-semibold">{tokenSymbol}</span>
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-success font-semibold">
                <span>{showBreakdown ? 'Hide' : 'Breakdown'}</span>
                <span className={'transition-transform ' + (showBreakdown ? 'rotate-180' : '')}>▾</span>
              </div>
            </button>
            {showBreakdown && (
              <div className="border-t border-success/30 px-4 py-3 space-y-3 bg-white/60">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-primary" />
                      <span className="text-sm font-medium text-black">Vaquita APY</span>
                    </div>
                    <span className="text-sm font-bold text-primary">{vaquitaApy.toFixed(2)}%</span>
                  </div>
                  <p className="text-xs text-gray-600 ml-5 mt-0.5">
                    Rewards from the Vaquita community pool, based on your lock period.
                  </p>
                </div>
                {hasProtocolApy && (
                  <div className="pt-3 border-t border-success/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-purple-600" />
                        <span className="text-sm font-medium text-black">{networkLabel} APY</span>
                      </div>
                      <span className="text-sm font-bold text-purple-600">{protocolApy.toFixed(2)}%</span>
                    </div>
                    <p className="text-xs text-gray-600 ml-5 mt-0.5">
                      Yield from {networkLabel} lending protocol where your funds are deposited.
                    </p>
                  </div>
                )}
                {network?.networkName && isStellarNetwork(network.networkName) && dataApy?.interestModelNote ? (
                  <p className="text-xs text-gray-500 leading-snug pt-3 border-t border-success/20">
                    {dataApy.interestModelNote}
                  </p>
                ) : null}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="border border-primary border-b-2 rounded-xl bg-primary/10 p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Image src="/icons/bag.svg" alt="bag" width={18} height={18} />
                <p className="text-xs text-primary font-semibold">My deposits</p>
              </div>
              <p className="text-lg font-bold text-primary leading-tight">
                {activeDepositsTotalAmount.toFixed(2)}
                <span className="text-xs ml-1 font-semibold">{tokenSymbol}</span>
              </p>
            </div>
            <div className="border border-black/15 border-b-2 rounded-xl bg-black/5 p-3 text-center">
              <p className="text-xs text-black/60 font-semibold mb-1">Estimated earnings total</p>
              <p className="text-lg font-bold text-black leading-tight">
                {totalEstimatedEarnings.toFixed(2)}
                <span className="text-xs ml-1 font-semibold">{tokenSymbol}</span>
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Image src="/icons/deposits.svg" alt="deposits" width={20} height={20} />
              <h3 className="text-sm font-bold text-black">My Vaquitas</h3>
              <span className="text-xs text-gray-500">({activeDeposits.length})</span>
            </div>
            {activeDeposits.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center border border-dashed border-black/20 rounded-xl">
                <Image src="/no_data.svg" alt="No data" width={80} height={80} />
                <p className="text-gray-500 text-sm mt-2">No active vaquitas</p>
              </div>
            ) : (
              <div className="space-y-2">
                {activeDeposits.map((deposit) => (
                  <div key={deposit.id} data-tutorial={onVaquitaSelect ? 'tutorial-vaquita-card' : undefined}>
                    <VaquitaDepositCard
                      deposit={deposit}
                      onPress={() => (onVaquitaSelect ? onVaquitaSelect(deposit) : setSelectedVaquita(deposit))}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border border-black/10 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowHowItWorks((v) => !v)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-black/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="text-sm font-semibold text-black">How rewards work</span>
              </div>
              <span className={'text-black/60 transition-transform ' + (showHowItWorks ? 'rotate-180' : '')}>
                ▾
              </span>
            </button>
            {showHowItWorks && (
              <ul className="px-4 pb-4 pt-1 text-sm text-gray-700 space-y-1.5 list-disc list-inside">
                <li>Your deposit generates yield from multiple sources.</li>
                <li>Estimated rewards are calculated using the current APY.</li>
                <li>The APY is dynamic and may fluctuate based on user activity and total deposits.</li>
                <li>Rewards become claimable only after the saving period ends.</li>
                <li>Final rewards are confirmed upon withdrawal.</li>
              </ul>
            )}
          </div>

          {network && (
            <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 pt-1">
              <span>Network:</span>
              <span className="font-semibold text-black">{network.networkName}</span>
            </div>
          )}
        </div>
      )}
    </AppModal>
    {!onVaquitaSelect && selectedVaquita && (
      <VaquitaModalContent
        isOpen={!!selectedVaquita}
        onClose={() => setSelectedVaquita(null)}
        vaquita={selectedVaquita}
      />
    )}
    </>
  );
}
