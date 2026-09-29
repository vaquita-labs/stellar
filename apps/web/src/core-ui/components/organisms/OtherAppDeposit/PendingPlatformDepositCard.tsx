'use client';

import { MIN_IDLE_USDC } from '@/core-ui/helpers/numbers';
import { Spinner } from '@heroui/react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FiX } from 'react-icons/fi';
import { useCloseDepositIntent } from '../../../hooks/useDepositIntents';
import { useWalletUsdc } from '../../../hooks/useWalletUsdc';
import type { DepositIntentDTO, DepositPlatformDTO } from '../../../types';

interface PendingPlatformDepositCardProps {
  intent: DepositIntentDTO;
  platform: DepositPlatformDTO;
  onShowAddress: () => void;
  onShowSteps: () => void;
}

/**
 * "Esperando tu depósito de Binance": lo que queda en el home cuando el usuario
 * vio su dirección y se fue a su app a retirar.
 *
 * Mientras está a la vista, `DepositPanel` deja prendido el poll de saldo, y una
 * subida desde que apareció cuenta como llegada (mismo criterio que el sheet de
 * recibir). La base es el saldo al montarse, no al abrir la espera: si la plata
 * entró con la app cerrada no hay forma de distinguirla, y la tarjeta se va sola
 * a las 24 h o con la X.
 */
export function PendingPlatformDepositCard({ intent, platform, onShowAddress, onShowSteps }: PendingPlatformDepositCardProps) {
  const { t } = useTranslation();
  const closeIntent = useCloseDepositIntent();
  const walletUsdc = useWalletUsdc();
  const baseline = useRef<number | null>(null);

  const closeRef = useRef(closeIntent.mutate);
  useEffect(() => {
    closeRef.current = closeIntent.mutate;
  });

  useEffect(() => {
    if (walletUsdc === null) return;
    if (baseline.current === null) {
      baseline.current = walletUsdc;
      return;
    }
    if (walletUsdc - baseline.current >= MIN_IDLE_USDC) {
      closeRef.current({ id: intent.id, action: 'arrived' });
    }
  }, [walletUsdc, intent.id]);

  return (
    <div className="w-full max-w-xl px-1">
      <div className="flex items-center gap-3 rounded-xl border border-black border-b-4 bg-white px-3 py-2.5">
        <Spinner size="sm" color="current" className="shrink-0 text-black" />
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-bold text-black">
            {t('deposit.otherApp.pending.title', 'Waiting for your {{name}} deposit', { name: platform.name })}
          </p>
          <div className="flex gap-3 text-xs font-semibold">
            <button type="button" onClick={onShowAddress} className="text-black underline underline-offset-2">
              {t('deposit.otherApp.pending.address', 'Show address')}
            </button>
            <button type="button" onClick={onShowSteps} className="text-black underline underline-offset-2">
              {t('deposit.otherApp.pending.steps', 'See the steps')}
            </button>
          </div>
        </div>
        <button
          type="button"
          aria-label={t('deposit.otherApp.pending.dismiss', 'Dismiss')}
          onClick={() => closeIntent.mutate({ id: intent.id, action: 'cancel' })}
          disabled={closeIntent.isPending}
          className="flex h-9 w-9 shrink-0 items-center justify-center text-gray-500"
        >
          <FiX className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
