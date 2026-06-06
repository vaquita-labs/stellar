'use client';

import { VaquitaDepositCard } from '@/core-ui/components/home/VaquitaDepositCard';
import { getDepositsData } from '@/core-ui/helpers/deposits';
import { Spinner } from '@heroui/react';
import Image from 'next/image';
import { useState } from 'react';
import { useApyByLockPeriod, useDeposit, useDepositsComplete } from '../../../hooks';
import { useConfigStore } from '../../../stores';
import { DepositResponseDTO } from '../../../types';
import { AppModal } from '../../molecules/AppModal';
import { useVaquitaDetail } from '../VaquitaModal';
import { BankAPYModalProps } from './types';

export function BankAPYModal({
  open,
  onOpenChange,
  injectedDeposits,
  simulate = false,
  simulateInterest = 0,
  onSimulatedWithdraw,
  onDetailOpenChange,
}: BankAPYModalProps) {
  const { network, lockPeriod, walletAddress, token } = useConfigStore();
  const { data: depositsData, isLoading: isLoadingDeposits } = useDepositsComplete(walletAddress);
  // APY real por fuente y nombre del mercado de lending (ej. Defindex).
  const { data: dataApy } = useApyByLockPeriod(lockPeriod, token?.symbol ?? '');
  const lendingMarketName = dataApy?.lendingMarketName ?? '';
  const vaquitaApy = dataApy?.vaquitaApy ?? 0;
  const protocolApy = dataApy?.protocolApy ?? 0;

  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [showEarningsInfo, setShowEarningsInfo] = useState(false);
  const [selectedVaquita, setSelectedVaquita] = useState<DepositResponseDTO | null>(null);

  // En modo tutorial mostramos un depósito inyectado en vez de los reales.
  const sourceDeposits = injectedDeposits ?? depositsData?.deposits ?? [];

  const { deposits, activeDeposits, activeDepositsTotalAmount } = getDepositsData(sourceDeposits);
  const tokenSymbol = deposits[0]?.tokenSymbol ?? token?.symbol ?? 'USDC';
  // Ganancias acumuladas hasta el momento (no la proyección anual), desglosadas
  // por su origen para el detalle expandible.
  const vaquitaEarnings = activeDeposits.reduce((acc, d) => acc + (d.vaquitaInterest ?? 0), 0);
  const protocolEarnings = activeDeposits.reduce(
    (acc, d) => acc + (d.protocolInterest ?? 0) + (d.blendInterest ?? 0),
    0,
  );
  const totalEstimatedEarnings = vaquitaEarnings + protocolEarnings;

  // Con depósitos inyectados (tutorial) no esperamos a las queries reales.
  const isLoading = !injectedDeposits && isLoadingDeposits;

  // Detalle dentro del MISMO modal (igual que la lista de depósitos): al
  // seleccionar una vaquita pintamos su detalle aquí, con flecha de "atrás", en
  // vez de abrir un 2º modal encima. El tutorial usa el mismo detalle inline en
  // modo simulado (sin segundo modal).
  const inDetail = !!selectedVaquita;
  const { data: fullDeposit } = useDeposit(selectedVaquita?.id ?? 0);
  // En tutorial el depósito vive en `injectedDeposits` y se recalcula en cada
  // render (cuenta regresiva), así que tomamos la versión viva por id; en modo
  // real refrescamos el contador con useDeposit.
  const detailVaquita = !inDetail
    ? null
    : simulate
      ? deposits.find((d) => d.id === selectedVaquita!.id) ?? selectedVaquita
      : fullDeposit ?? selectedVaquita;
  const backToList = () => {
    setSelectedVaquita(null);
    onDetailOpenChange?.(false);
  };
  const detail = useVaquitaDetail({
    vaquita: detailVaquita,
    onClose: backToList,
    isLeaderboard: false,
    simulate,
    simulateInterest,
    onSimulatedWithdraw,
  });
  const detailReady = inDetail && detail.ready;

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      isDismissable={!detail.loading}
      onBack={inDetail && !detail.loading ? backToList : undefined}
      title={inDetail ? detail.title : 'Bank Rewards'}
      titleIcon={inDetail ? '/icons/bag.svg' : undefined}
      titleIconAlt={inDetail ? 'vaquita' : 'rewards'}
      size="lg"
      bodyClassName={inDetail ? 'flex flex-col gap-5 pb-6' : undefined}
      footer={detailReady ? detail.footer : undefined}
    >
      {inDetail ? (
        detail.body
      ) : isLoading ? (
        <div className="flex justify-center items-center py-12">
          <Spinner size="lg" color="accent" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Métrica principal: total depositado (lo más grande) */}
          <div className="border border-black border-b-2 rounded-xl bg-primary/10 p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Image src="/icons/bag.svg" alt="bag" width={18} height={18} />
              <p className="text-xs text-primary font-semibold uppercase tracking-wide">My deposits</p>
            </div>
            <p className="text-4xl font-bold text-primary leading-tight">
              {activeDepositsTotalAmount.toFixed(2)}
              <span className="text-lg ml-1 font-semibold">{tokenSymbol}</span>
            </p>
          </div>

          {/* Segunda métrica: ganancias ganadas hasta ahora, con desglose */}
          <div className="border border-black border-b-2 rounded-xl bg-success/10 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowEarningsInfo((v) => !v)}
              className="w-full flex items-center justify-between gap-3 p-4 hover:bg-success/5 transition-colors text-left"
            >
              <div>
                <p className="text-xs text-success/80 font-semibold uppercase tracking-wide">
                  Estimated earnings total
                </p>
                <p className="text-2xl font-bold text-success leading-tight">
                  {totalEstimatedEarnings.toFixed(2)}
                  <span className="text-sm ml-1 font-semibold">{tokenSymbol}</span>
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-success font-semibold shrink-0">
                <span>{showEarningsInfo ? 'Hide' : 'Details'}</span>
                <span className={'transition-transform ' + (showEarningsInfo ? 'rotate-180' : '')}>▾</span>
              </div>
            </button>
            {showEarningsInfo && (
              <div className="border-t border-black/10 px-4 py-3 space-y-3 bg-white/60">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-primary" />
                      <span className="text-sm font-medium text-black">Vaquita rewards</span>
                      <span className="text-[10px] font-bold text-primary bg-primary/15 px-1.5 py-0.5 rounded-full">
                        {vaquitaApy.toFixed(2)}% APY
                      </span>
                    </div>
                    <span className="text-sm font-bold text-black tabular-nums">
                      +{vaquitaEarnings.toFixed(2)} {tokenSymbol}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 ml-5 mt-0.5">
                    Rewards from the Vaquita community pool, based on your lock period.
                  </p>
                </div>
                <div className="pt-3 border-t border-black/10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-success" />
                      <span className="text-sm font-medium text-black">
                        {lendingMarketName ? `${lendingMarketName} rewards` : 'Protocol rewards'}
                      </span>
                      <span className="text-[10px] font-bold text-success bg-success/15 px-1.5 py-0.5 rounded-full">
                        {protocolApy.toFixed(2)}% APY
                      </span>
                    </div>
                    <span className="text-sm font-bold text-black tabular-nums">
                      +{protocolEarnings.toFixed(2)} {tokenSymbol}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 ml-5 mt-0.5">
                    Yield from {lendingMarketName || 'the lending protocol'} where your funds are deposited.
                  </p>
                </div>
                <p className="text-xs text-gray-500 leading-snug pt-3 border-t border-black/10">
                  These are estimates and update over time — final rewards are confirmed when you withdraw.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-black">My deposits</h3>
              <span className="text-xs text-gray-500">({activeDeposits.length})</span>
            </div>
            {activeDeposits.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center border border-dashed border-black/20 rounded-xl">
                <Image src="/no_data.svg" alt="No data" width={80} height={80} />
                <p className="text-gray-500 text-sm mt-2">No active deposits</p>
              </div>
            ) : (
              <div className="space-y-2">
                {activeDeposits.map((deposit) => (
                  <div key={deposit.id} data-tutorial={simulate ? 'tutorial-vaquita-card' : undefined}>
                    <VaquitaDepositCard
                      deposit={deposit}
                      onPress={() => {
                        setSelectedVaquita(deposit);
                        onDetailOpenChange?.(true);
                      }}
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
  );
}
