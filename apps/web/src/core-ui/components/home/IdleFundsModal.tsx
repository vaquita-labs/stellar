'use client';

import { Spinner } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { FiAlertCircle, FiTrendingUp } from 'react-icons/fi';
import { AppModal } from '../molecules/AppModal';
import { PressableButton } from '../molecules/PressableButton';

interface IdleFundsModalProps {
  open: boolean;
  onOpenChange: () => void;
  /** Monto ocioso (USDC) que el usuario puede invertir. */
  idle: number;
  /** Dispara el supply a Blend (gesto del usuario → firma custodial válida). */
  onInvest: () => void;
  investing: boolean;
  error: string | null;
  /** Solo se puede cerrar si hubo error (válvula de escape); si no, es un gate. */
  dismissable: boolean;
}

/**
 * Pantalla COMPLETA de plata ociosa. Cuando a un usuario le entra USDC y queda
 * sin invertir, ocupamos la pantalla: "tenés esta cantidad" y la acción principal
 * es invertirlo en Blend (1 toque → firma). Es un NUDGE, no un muro: se puede
 * cerrar (`dismissable`), y al cerrar la plata queda en su wallet, disponible y
 * sin invertir — no la movemos ni la forzamos. No reaparece hasta que entre plata
 * nueva (lo maneja `AutoInvest`).
 */
export function IdleFundsModal({
  open,
  onOpenChange,
  idle,
  onInvest,
  investing,
  error,
  dismissable,
}: IdleFundsModalProps) {
  const { t } = useTranslation();

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('idleFunds.title', 'Put your money to work')}
      size="lg"
      fullScreen
      // Gate: sin cierre ni dismiss, salvo que la inversión haya fallado.
      isDismissable={dismissable}
      hideClose={!dismissable}
      bodyClassName="flex flex-col items-center justify-center gap-6 text-center px-6 flex-1"
      footer={
        <PressableButton
          variant="success"
          size="cta"
          className="py-2.5!"
          onClick={onInvest}
          disabled={investing}
        >
          {investing ? (
            <>
              <Spinner size="sm" color="current" /> {t('idleFunds.processing', 'Investing...')}
            </>
          ) : (
            t('idleFunds.cta', 'Invest ${{amount}}', { amount: idle.toFixed(2) })
          )}
        </PressableButton>
      }
    >
      <div className="flex items-center justify-center w-20 h-20 rounded-full bg-success border border-black border-b-4">
        <FiTrendingUp className="w-10 h-10 text-black" strokeWidth={2.5} />
      </div>

      <div>
        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">
          {t('idleFunds.label', 'You have idle funds')}
        </p>
        <p className="mt-2 text-5xl font-bold text-black tabular-nums leading-none">
          ${idle.toFixed(2)}
        </p>
      </div>

      <p className="text-sm text-gray-500 max-w-xs">
        {t(
          'idleFunds.subtitle',
          'This USDC is just sitting there. Put it to work in Blend and start earning right away.',
        )}
      </p>

      {error ? (
        <div className="flex items-start gap-2 text-sm text-error font-semibold max-w-xs">
          <FiAlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      ) : null}
    </AppModal>
  );
}
