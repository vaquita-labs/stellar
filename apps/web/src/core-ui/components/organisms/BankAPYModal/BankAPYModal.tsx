'use client';

import { useDepositListControls } from '@/core-ui/components/home/DepositListControls';
import { DepositListTab, DepositListTabs } from '@/core-ui/components/home/DepositListTabs';
import { VaquitaDepositCard } from '@/core-ui/components/home/VaquitaDepositCard';
import { WithdrawnDepositCard } from '@/core-ui/components/home/WithdrawnDepositCard';
import { getDepositsData } from '@/core-ui/helpers/deposits';
import { AppTransaction, buildTransactions } from '@/core-ui/helpers/transactions';
import { Spinner } from '@heroui/react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDeposit, useDepositsComplete } from '../../../hooks';
import { useConfigStore } from '../../../stores';
import { DepositResponseDTO } from '../../../types';
import { Button } from '../../atoms';
import { AppModal } from '../../molecules/AppModal';
import { TransactionList, TransactionRow, TransactionRowSkeleton } from '../../molecules/TransactionRow';
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
  onConfirmingChange,
  lockToWithdraw = false,
}: BankAPYModalProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { walletAddress } = useConfigStore();
  const { data: depositsData, isLoading: isLoadingDeposits } = useDepositsComplete(walletAddress);

  const [selectedVaquita, setSelectedVaquita] = useState<DepositResponseDTO | null>(null);
  const [tab, setTab] = useState<DepositListTab>('active');

  // En modo tutorial mostramos un depósito inyectado en vez de los reales.
  const sourceDeposits = injectedDeposits ?? depositsData?.deposits ?? [];

  const { deposits, activeDeposits, withdrawnDeposits } = getDepositsData(sourceDeposits);

  const { controls, filteredActiveDeposits, filteredWithdrawnDeposits } = useDepositListControls({
    tab,
    activeDeposits,
    withdrawnDeposits,
  });

  // Últimos 3 movimientos (depósitos + retiros) para el resumen del modal.
  const recentTransactions = useMemo(() => buildTransactions(sourceDeposits).slice(0, 3), [sourceDeposits]);

  const goToTransactions = (path = '/transactions') => {
    onOpenChange();
    router.push(path);
  };

  // Un depósito abre su detalle inline (donde vive el retiro); un retiro ya no
  // tiene acciones, así que va directo a la pantalla de detalle del movimiento.
  const onTransactionPress = (transaction: AppTransaction) => {
    if (transaction.kind !== 'deposit') {
      goToTransactions(`/transactions/${transaction.id}`);
      return;
    }
    const deposit = sourceDeposits.find((d) => d.id === transaction.depositId);
    if (!deposit) return;
    setSelectedVaquita(deposit);
    onDetailOpenChange?.(true);
  };

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
    // Bloquea el Cancel del detalle (solo aplica a la pantalla de detalle; la de
    // confirmación usa otro footer, donde el Cancel sigue habilitado).
    lockClose: lockToWithdraw,
  });
  const detailReady = inDetail && detail.ready;

  // Avisamos al orquestador (tutorial) cuando se entra/sale de "Confirm
  // withdrawal" para que muestre el aviso de paciencia encima.
  useEffect(() => {
    onConfirmingChange?.(inDetail && detail.isConfirming);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inDetail, detail.isConfirming]);

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      isDismissable={!detail.loading && !lockToWithdraw}
      hideClose={lockToWithdraw}
      onBack={inDetail && !detail.loading && !lockToWithdraw ? backToList : undefined}
      title={
        inDetail
          ? detail.title
          : simulate
            ? t('deposit.bank.title', 'Bank Rewards')
            : t('transactions.recent', 'Recent transactions')
      }
      titleIconAlt={inDetail ? 'vaquita' : 'rewards'}
      size="lg"
      // Sin footer propio, el "See more" queda pegado al borde inferior del
      // sheet: un poco más de aire abajo para que respire.
      bodyClassName={inDetail ? 'flex flex-col gap-5 pb-6' : 'pb-7'}
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
          {/* Fuera del tutorial el modal solo muestra los últimos movimientos
              (depósitos y retiros) para que abra liviano; el historial completo,
              con filtros y detalle, vive en /transactions. En modo tutorial se
              mantiene la lista de depósitos completa porque los pasos guiados
              anclan en la tarjeta de la vaquita. */}
          {!simulate ? (
            <div className="space-y-3">
              {isLoadingDeposits && !depositsData ? (
                <TransactionList>
                  {[0, 1, 2].map((i) => (
                    <TransactionRowSkeleton key={i} />
                  ))}
                </TransactionList>
              ) : recentTransactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center border border-dashed border-black/20 rounded-xl">
                  <Image src="/no_data.svg" alt={t('deposit.list.noData', 'No data')} width={80} height={80} />
                  <p className="text-gray-500 text-sm mt-2">{t('transactions.empty', 'No transactions yet')}</p>
                </div>
              ) : (
                <TransactionList>
                  {recentTransactions.map((transaction) => (
                    <TransactionRow
                      key={transaction.id}
                      transaction={transaction}
                      onPress={() => onTransactionPress(transaction)}
                    />
                  ))}
                </TransactionList>
              )}
              <Button variant="white" className="w-full" onPress={() => goToTransactions()}>
                {t('transactions.seeMore', 'See more')}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-black">{t('deposit.bank.myDeposits', 'My deposits')}</h3>
              {/* Mismos tabs Activos/Retirados que VaquitasListModal; los retirados
                  distinguen retiro a tiempo de retiro anticipado. */}
              <DepositListTabs
                tab={tab}
                onTabChange={setTab}
                activeCount={activeDeposits.length}
                withdrawnCount={withdrawnDeposits.length}
              />
              {(tab === 'active' ? activeDeposits : withdrawnDeposits).length > 0 && controls}
              {tab === 'active' ? (
                filteredActiveDeposits.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-center border border-dashed border-black/20 rounded-xl">
                    <Image src="/no_data.svg" alt={t('deposit.list.noData', 'No data')} width={80} height={80} />
                    <p className="text-gray-500 text-sm mt-2">{t('deposit.list.noActiveDeposits', 'No active deposits')}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredActiveDeposits.map((deposit) => (
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
                )
              ) : filteredWithdrawnDeposits.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center border border-dashed border-black/20 rounded-xl">
                  <Image src="/no_data.svg" alt={t('deposit.list.noData', 'No data')} width={80} height={80} />
                  <p className="text-gray-500 text-sm mt-2">{t('deposit.list.noWithdrawnDeposits', 'No withdrawn deposits')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredWithdrawnDeposits.map((deposit) => (
                    <WithdrawnDepositCard
                      key={deposit.id}
                      deposit={deposit}
                      onPress={() => {
                        setSelectedVaquita(deposit);
                        onDetailOpenChange?.(true);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </AppModal>
  );
}
