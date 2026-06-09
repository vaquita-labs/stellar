'use client';

import { useRestWithdrawal } from '@/core-ui/hooks';
import { isNewDepositHandled } from '@/networks/helpers';
import { stellarExpertTxUrl } from '@/networks/stellar/helpers';
import { parsePoolErrorMessage } from '@/networks/stellar/poolQueries';
import { Button, Spinner, toast } from '@heroui/react';
import Image from 'next/image';
import { ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertTriangle, FiCalendar, FiCheckCircle } from 'react-icons/fi';
import { getInterestData } from '../../../helpers';
import { useApyByLockPeriod, useProfileData, useTransactions, useWithdrawalTime } from '../../../hooks';
import { useConfigStore } from '../../../stores';
import { DepositResponseDTO, DepositStatus, DepositWithdrawalState } from '../../../types';

const TimeTile = ({ value, label }: { value: number; label: string }) => (
  <div className="flex flex-1 min-w-0 flex-col items-center justify-center bg-white border border-black border-b-2 rounded-md py-2">
    <span className="text-2xl font-bold text-black tabular-nums leading-none">
      {value.toString().padStart(2, '0')}
    </span>
    <span className="text-[10px] uppercase text-default-500 tracking-wider mt-1">{label}</span>
  </div>
);

const breakdownTime = (totalSeconds: number) => {
  const safe = Math.max(0, totalSeconds);
  return {
    days: Math.floor(safe / 86400),
    hours: Math.floor((safe % 86400) / 3600),
    minutes: Math.floor((safe % 3600) / 60),
    seconds: safe % 60,
  };
};

// Depósito vacío para mantener el orden de hooks estable cuando todavía no hay
// una vaquita seleccionada (ej. la lista antes de abrir un detalle).
const EMPTY_DEPOSIT: DepositResponseDTO = {
  id: 0,
  state: DepositWithdrawalState.DEPOSIT_SUCCESS,
  amount: 0,
  tokenSymbol: '',
  inLockPeriod: false,
  lockPeriod: 0,
  vaquitaContractAddress: '',
  status: DepositStatus.CONFIRMED,
  walletAddress: '',
  withdrawals: [],
  transactionHash: '',
  depositIdHex: '',
  vaquitaInterest: 0,
  protocolInterest: 0,
  blendInterest: 0,
  createdTimestamp: 0,
  updatedTimestamp: 0,
  serverTimestamp: 0,
  confirmedTimestamp: 0,
};

export interface UseVaquitaDetailParams {
  vaquita: DepositResponseDTO | null;
  onClose: () => void;
  isLeaderboard?: boolean;
  /**
   * Modo tutorial: misma UI, pero el lock/interés se derivan en vivo del
   * `vaquita` simulado y al confirmar NO se toca la blockchain.
   */
  simulate?: boolean;
  /** Interés total a mostrar/entregar en modo simulado. */
  simulateInterest?: number;
  /** Llamado tras un retiro simulado exitoso. */
  onSimulatedWithdraw?: () => void;
  /**
   * Modo tutorial: bloquea el botón Cancel/Close del detalle para forzar el
   * toque en Withdraw (el único accionable en ese paso).
   */
  lockClose?: boolean;
}

export interface VaquitaDetailView {
  title: string;
  body: ReactNode;
  footer: ReactNode;
  /** Hay un retiro en curso: el modal no debe poder cerrarse. */
  loading: boolean;
  /** Ya montado en cliente (evita desajustes de hidratación por el reloj). */
  ready: boolean;
  /** Está en la pantalla de "Confirm withdrawal" (paso de confirmar el retiro). */
  isConfirming: boolean;
}

/**
 * Lógica + presentación del detalle de una vaquita (lock, intereses, retiro)
 * desacoplada del contenedor. La devuelve en partes (`title`/`body`/`footer`)
 * para que la pueda hostear tanto su propio modal (tutorial, Bank Rewards) como
 * el modal de la lista de depósitos sin abrir un segundo modal encima.
 */
export const useVaquitaDetail = ({
  vaquita,
  onClose,
  isLeaderboard,
  simulate = false,
  simulateInterest = 0,
  onSimulatedWithdraw,
  lockClose = false,
}: UseVaquitaDetailParams): VaquitaDetailView => {
  const { t } = useTranslation();
  const deposit = vaquita ?? EMPTY_DEPOSIT;
  const [confirming, setConfirming] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const { transactionWithdraw } = useTransactions();
  const { confirmWithdrawal } = useRestWithdrawal();
  const { network, token } = useConfigStore();
  const depositLockPeriod = deposit.lockPeriod;
  const { data: dataApy } = useApyByLockPeriod(depositLockPeriod, token?.symbol ?? '');
  const withdrawalInfo = useWithdrawalTime(deposit);
  const realInterest = getInterestData(network!, dataApy, deposit.amount, depositLockPeriod);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Al cambiar de vaquita (o volver a la lista) reseteamos la confirmación para
  // no reabrir un detalle directamente en la pantalla de "confirmar retiro".
  useEffect(() => setConfirming(null), [vaquita?.id]);

  // En modo tutorial el interés es fijo (demo) y el lock se deriva en vivo del
  // contador; en modo normal salen del cálculo real y del flag del backend.
  const totalInterest = simulate ? simulateInterest : realInterest.totalInterest;
  const vaquitaInterest = simulate ? simulateInterest : realInterest.vaquitaInterest;
  const protocolInterest = simulate ? 0 : realInterest.protocolInterest + realInterest.blendInterest;

  const isDisabled = simulate ? false : !network || !transactionWithdraw;
  const inLockPeriod = simulate ? !withdrawalInfo.canWithdraw : deposit.inLockPeriod;
  const isConfirming = confirming === deposit.id && confirming !== null;
  const isEarlyWithdrawn = deposit.state === DepositWithdrawalState.WITHDRAW_SUCCESS_EARLY;
  const isWithdrawn = isEarlyWithdrawn || deposit.state === DepositWithdrawalState.WITHDRAW_SUCCESS;
  const withWithdrawButton = !isLeaderboard && deposit.state === DepositWithdrawalState.DEPOSIT_SUCCESS;
  const withdrawProcessing = deposit.state === DepositWithdrawalState.WITHDRAW_PROCESSING;
  const time = breakdownTime(withdrawalInfo.timeRemaining);
  const finalAmount = inLockPeriod ? deposit.amount : deposit.amount + totalInterest;

  // Para depósitos retirados mostramos el valor real guardado (lo ganado), no
  // la estimación en vivo del APY.
  const storedTotal =
    (deposit.vaquitaInterest ?? 0) + (deposit.protocolInterest ?? 0) + (deposit.blendInterest ?? 0);
  const withdrawnTimestamp =
    deposit.withdrawals?.[deposit.withdrawals.length - 1]?.confirmedTimestamp || deposit.updatedTimestamp;

  // "Crypto mode" (profile.cryptoSavvy): surface the deposit's on-chain tx as a
  // stellar.expert link. Guarded to real 64-hex hashes — legacy confirms could
  // store a `Date.now()` placeholder — and skipped in tutorial mode (no real tx).
  const { data: profile } = useProfileData();
  const cryptoMode = profile?.cryptoSavvy ?? false;
  const txHash = /^[0-9a-f]{64}$/i.test(deposit.transactionHash) ? deposit.transactionHash : null;
  const showTxHash = cryptoMode && !simulate && !!txHash;
  const txHashRow = showTxHash && txHash && (
    <div className="flex items-center justify-between text-xs">
      <span className="text-default-500">{t('deposit.detail.viewOnStellarExpert', 'View on Stellar Expert')}</span>
      <span className="flex items-center gap-1.5">
        <a
          href={stellarExpertTxUrl(txHash, network?.type)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono font-semibold text-primary underline underline-offset-2 hover:text-primary/80 transition"
        >
          {`${txHash.slice(0, 6)}…${txHash.slice(-4)}`}
        </a>
        {/* "Mainnet"/"Testnet" are technical proper nouns, identical across locales. */}
        <span className="text-[10px] font-bold uppercase tracking-wide bg-white text-default-500 border border-black/20 rounded-full px-2 py-0.5">
          {network?.type === 'mainnet' ? 'Mainnet' : 'Testnet'}
        </span>
      </span>
    </div>
  );

  const onWithdraw = async () => {
    if (isDisabled) return;

    // Modo tutorial: confirmación simulada, sin transacción real.
    if (simulate) {
      setLoading(true);
      await new Promise((resolve) => setTimeout(resolve, 600));
      setLoading(false);
      onSimulatedWithdraw?.();
      onClose();
      return;
    }

    if (!network || !transactionWithdraw) return;
    setLoading(true);
    let isSuccess = false;
    let lastError: unknown = null;
    if (isNewDepositHandled(network.networkName)) {
      const { success, error } = await transactionWithdraw(
        +deposit.id,
        deposit.depositIdHex,
        deposit.vaquitaContractAddress
      );
      isSuccess = !!success;
      lastError = error ?? null;
    } else {
      const { success, txHash, transaction, error } = await transactionWithdraw(
        +deposit.id,
        deposit.depositIdHex,
        deposit.vaquitaContractAddress
      );
      lastError = error ?? null;
      if (success) {
        await confirmWithdrawal({
          depositId: +deposit.id,
          txHash: txHash || `${Date.now()}`,
          transactionRaw: JSON.stringify(transaction, (_k, v) =>
            typeof v === 'bigint' ? v.toString() : v
          ),
        });
        isSuccess = !!success;
      }
    }
    if (isSuccess) {
      toast.success(t('deposit.withdraw.successTitle', 'Withdrawal successful!'), {
        indicator: (
          <Image
            src="/icons/global/coin.png"
            alt=""
            width={30}
            height={30}
            className="drop-shadow-sm"
          />
        ),
        description: t(
          'deposit.withdraw.successDescription',
          'Your money is on its way! This may take a few seconds. Everything will be ready in a moment.',
        ),
        timeout: 6000,
      });
      onClose();
    } else {
      const poolMsg = parsePoolErrorMessage(lastError);
      toast.danger(t('deposit.withdraw.errorTitle', "Withdrawal didn't go through"), {
        indicator: <Image src="/vaquita/error.svg" alt="" width={32} height={32} />,
        description: poolMsg
          ? poolMsg
          : lastError instanceof Error
            ? lastError.message
            : undefined,
        timeout: 30000,
      });
    }
    setLoading(false);
  };

  const detailsFooter = (
    <div className="flex w-full gap-2">
      <Button
        onPress={onClose}
        className="flex-1 bg-transparent border border-black border-b-2 text-black rounded-md font-semibold"
        isDisabled={loading || lockClose}
      >
        {withWithdrawButton ? t('common.cancel') : t('common.close')}
      </Button>
      {withWithdrawButton && (
        // En tutorial marcamos el botón para que el anillo guía pueda forzar el
        // toque en Withdraw (y así llegar a la confirmación / aviso de paciencia).
        <div className="flex flex-1" data-tutorial={simulate ? 'tutorial-withdraw' : undefined}>
          <Button
            onPress={() => setConfirming(deposit.id)}
            className={
              'flex-1 rounded-md font-bold text-black border border-black border-b-2 ' +
              (inLockPeriod
                ? 'bg-transparent hover:bg-warning-soft'
                : 'bg-success border-[#018222] border-b-5')
            }
            isDisabled={isDisabled}
          >
            {t('deposit.withdraw.button', 'Withdraw')}
          </Button>
        </div>
      )}
      {withdrawProcessing && (
        <Button
          className="flex-1 rounded-md font-bold text-black border border-black border-b-2 bg-default-100"
          isDisabled
        >
          <Spinner size="sm" color="current" />
          {t('deposit.processingShort', 'Processing')}
        </Button>
      )}
    </div>
  );

  const confirmFooter = (
    <div className="flex w-full gap-2">
      <Button
        onPress={() => setConfirming(null)}
        className="flex-1 bg-transparent border border-black border-b-2 text-black rounded-md font-semibold"
        // Tutorial: al reclamar (lock cumplido) bloqueamos Cancel para forzar el
        // claim. En el retiro anticipado (inLockPeriod) Cancel es el botón guía,
        // así que sigue habilitado.
        isDisabled={loading || (lockClose && !inLockPeriod)}
      >
        {t('common.cancel')}
      </Button>
      <Button
        onPress={onWithdraw}
        className={
          'flex-1 rounded-md font-bold border border-b-5 ' +
          (inLockPeriod
            ? 'bg-[#E11D48] hover:bg-[#BE123C] border-[#9f1239] text-white'
            : 'bg-success border-[#018222] text-black')
        }
        // Tutorial: dejamos VER el aviso de retiro anticipado, pero bloqueamos
        // confirmarlo — hay que esperar el contador y reclamar con interés.
        isDisabled={loading || (simulate && inLockPeriod)}
      >
        {loading ? (
          <>
            <Spinner size="sm" color="current" />
            {t('deposit.processing', 'Processing...')}
          </>
        ) : inLockPeriod ? (
          t('deposit.withdraw.withdrawAnyway', 'Withdraw anyway')
        ) : (
          t('deposit.withdraw.claimNow', 'Claim now')
        )}
      </Button>
    </div>
  );

  const confirmBody = (
    <div className="flex flex-col gap-4">
      {!inLockPeriod && (
        <div className="flex flex-col items-center gap-2 bg-success-soft border border-success rounded-md p-4 text-center">
          <FiCheckCircle className="w-8 h-8 text-success" />
          <div>
            <p className="font-bold text-black">{t('deposit.confirm.timesUp', "Time's up!")}</p>
            <p className="text-sm text-default-600">{t('deposit.confirm.readyToClaim', 'Your vaquita is ready to claim.')}</p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1 bg-white border border-black border-b-2 rounded-md px-4 py-3">
          <span className="text-xs font-medium text-default-600 uppercase tracking-wide">{t('deposit.confirm.youWillReceive', 'You will receive')}</span>
          <span className="text-2xl font-bold text-success tabular-nums break-all leading-tight">
            {finalAmount.toFixed(2)} <span className="text-base">{token?.symbol}</span>
          </span>
        </div>

        {inLockPeriod && (
          <div className="flex flex-col gap-1 bg-white border border-black border-b-2 rounded-md px-4 py-3">
            <span className="text-xs font-medium text-default-600 uppercase tracking-wide">{t('deposit.confirm.youWillLose', 'You will lose')}</span>
            <span className="text-xl font-bold text-danger tabular-nums break-all leading-tight line-through decoration-2">
              ±{totalInterest.toFixed(2)} <span className="text-base">{token?.symbol}</span>
            </span>
          </div>
        )}
      </div>

      {inLockPeriod ? (
        <div className="flex items-center justify-center gap-1.5 text-xs text-default-600">
          <FiAlertTriangle className="w-3.5 h-3.5 text-danger shrink-0" />
          <span>
            {t('deposit.confirm.earlyWithdrawalPrefix', 'Early withdrawal rewards will be')}{' '}
            <span className="font-semibold text-danger">{t('deposit.confirm.forfeited', 'forfeited')}</span>
          </span>
        </div>
      ) : (
        <p className="text-sm text-center text-default-600">{t('deposit.confirm.sendTransaction', 'Confirm to send the transaction.')}</p>
      )}
    </div>
  );

  const detailBody = (
    <div className="flex flex-col gap-5">
      <div className="flex items-stretch justify-between gap-2">
        <div className="flex flex-col justify-center border border-black border-b-2 rounded-md px-3 py-1.5">
          <span className="text-[10px] uppercase tracking-wide text-default-500">{t('deposit.detail.startedAt', 'Started at')}</span>
          <span className="text-sm font-semibold text-black tabular-nums">
            {new Date(deposit.createdTimestamp).toLocaleDateString('es-ES', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
        <div className="flex items-center gap-2 border border-black border-b-2 rounded-md px-3 py-1.5">
          <FiCalendar className="w-4 h-4 text-black" />
          <span className="text-sm font-semibold text-black">
            {t('deposit.detail.lockSuffix', '{{period}} lock', { period: withdrawalInfo.lockPeriodFormatted })}
          </span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-1">
        <span className="text-3xl font-bold text-black tabular-nums">
          {deposit.amount.toFixed(2)} {token?.symbol}
        </span>
        <span className="text-sm font-semibold text-success tabular-nums">
          +{totalInterest.toFixed(2)} {token?.symbol} {t('deposit.detail.estAbbrev', 'est.')}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className={`text-sm font-bold ${inLockPeriod ? 'text-warning' : 'text-success'}`}>
            {inLockPeriod ? t('deposit.detail.locked', 'Locked') : t('deposit.detail.readyToWithdraw', 'Ready to withdraw')}
          </span>
          <span className="text-xs text-default-500 tabular-nums">
            {Math.round(withdrawalInfo.progress)}%
          </span>
        </div>
        <div className="w-full h-4 bg-white border border-black border-b-2 rounded-full overflow-hidden p-0.5">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${
              inLockPeriod ? 'bg-warning' : 'bg-success'
            }`}
            style={{ width: `${Math.min(100, Math.max(2, withdrawalInfo.progress))}%` }}
          />
        </div>
        {inLockPeriod && (
          <div className="flex gap-2">
            <TimeTile value={time.days} label={t('deposit.detail.days', 'Days')} />
            <TimeTile value={time.hours} label={t('deposit.detail.hours', 'Hours')} />
            <TimeTile value={time.minutes} label={t('deposit.detail.min', 'Min')} />
            <TimeTile value={time.seconds} label={t('deposit.detail.sec', 'Sec')} />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5 bg-default-50 border border-black/10 rounded-md p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-default-500">{t('deposit.detail.vaquitaInterest', 'Vaquita interest')}</span>
          <span className="font-semibold text-primary tabular-nums">
            +{vaquitaInterest.toFixed(2)} {token?.symbol}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-default-500">{t('deposit.detail.protocolInterest', 'Protocol interest')}</span>
          <span className="font-semibold text-primary tabular-nums">
            +{protocolInterest.toFixed(2)} {token?.symbol}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs border-t border-black/10 pt-1.5 mt-0.5">
          <span className="font-medium text-black">{t('deposit.detail.totalEstEarnings', 'Total est. earnings')}</span>
          <span className="font-bold text-success tabular-nums">
            +{totalInterest.toFixed(2)} {token?.symbol}
          </span>
        </div>
        {txHashRow && <div className="border-t border-black/10 pt-1.5 mt-0.5">{txHashRow}</div>}
      </div>
    </div>
  );

  // Detalle de un depósito ya retirado: solo lectura, mostrando lo ganado
  // (a tiempo, verde) o lo perdido por retirar antes (early, plomo).
  const withdrawnBody = (
    <div className="flex flex-col gap-5">
      {isEarlyWithdrawn ? (
        <div className="flex items-center gap-3 bg-default-100 border border-black border-b-2 rounded-md px-4 py-3">
          <FiAlertTriangle className="w-5 h-5 text-default-500 shrink-0" />
          <div>
            <p className="font-bold text-black">{t('deposit.withdrawn.earlyTitle', 'Withdrawn early')}</p>
            <p className="text-xs text-default-600">
              {t('deposit.withdrawn.earlyDescription', 'You withdrew before the lock ended, so the rewards were forfeited.')}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 bg-success/10 border border-success border-b-2 rounded-md px-4 py-3">
          <FiCheckCircle className="w-5 h-5 text-success shrink-0" />
          <div>
            <p className="font-bold text-black">{t('deposit.withdrawn.onTimeTitle', 'Withdrawn on time')}</p>
            <p className="text-xs text-default-600">
              {t('deposit.withdrawn.onTimeDescription', 'You completed the full lock period and kept your rewards.')}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center gap-1">
        <span className="text-3xl font-bold text-black tabular-nums">
          {deposit.amount.toFixed(2)} {token?.symbol}
        </span>
        {isEarlyWithdrawn ? (
          <span className="text-xs text-default-500">{t('deposit.withdrawn.amountReturned', 'Deposited amount returned')}</span>
        ) : (
          <span className="text-sm font-semibold text-success tabular-nums">
            +{storedTotal.toFixed(2)} {token?.symbol} {t('deposit.withdrawn.earnedSuffix', 'earned')}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1 text-xs text-default-500">
        <div className="flex items-center justify-between">
          <span>{t('deposit.detail.startedAt', 'Started at')}</span>
          <span className="tabular-nums">
            {new Date(deposit.createdTimestamp).toLocaleDateString('es-ES', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span>{t('deposit.detail.withdrawnAt', 'Withdrawn at')}</span>
          <span className="tabular-nums">
            {new Date(withdrawnTimestamp).toLocaleDateString('es-ES', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
        {txHashRow}
      </div>
    </div>
  );

  const withdrawnFooter = (
    <div className="flex w-full">
      <Button
        onPress={onClose}
        className="flex-1 bg-transparent border border-black border-b-2 text-black rounded-md font-semibold"
      >
        {t('common.close')}
      </Button>
    </div>
  );

  return {
    title: isWithdrawn
      ? t('deposit.detail.title', 'Your deposit')
      : isConfirming
        ? t('deposit.confirm.title', 'Confirm withdrawal')
        : t('deposit.detail.title', 'Your deposit'),
    body: isWithdrawn ? withdrawnBody : isConfirming ? confirmBody : detailBody,
    footer: isWithdrawn ? withdrawnFooter : isConfirming ? confirmFooter : detailsFooter,
    loading,
    ready: mounted,
    isConfirming,
  };
};
