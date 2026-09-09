'use client';

import { supportEmail } from '@/core-ui/config/featureFlags';
import { formatTokenFine } from '@/core-ui/helpers/numbers';
import { Spinner } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { PressableButton } from '../../molecules/PressableButton';

interface OnrampStatusScreenProps {
  /** En qué terminó (o en qué sigue) la compra. */
  screen: 'processing' | 'settled' | 'failed';
  /** USDC acreditado según el ledger, o null cuando nadie puede afirmarlo. */
  receivedUsdc: number | null;
  /** Lo que el usuario pagó, en moneda local. */
  amountFiat: string;
  currency: string;
  /** Lo que dijo el proveedor al rechazar, si dijo algo. */
  reason?: string | null;
  /** Cerrar el modal con la compra terminada. */
  onDone: () => void;
  /** Volver a empezar después de un rechazo. */
  onRestart: () => void;
}

/**
 * Lo que pasa después de pagar: esperando la acreditación, acreditada, o
 * rechazada.
 *
 * El rechazo se dice distinto del vencimiento a propósito: en un código vencido
 * no se cobró nada, y en un rechazo el usuario puede haber pagado y necesita
 * saber que hay plata que reclamar.
 */
export function OnrampStatusScreen({
  screen,
  receivedUsdc,
  amountFiat,
  currency,
  reason,
  onDone,
  onRestart,
}: OnrampStatusScreenProps) {
  const { t } = useTranslation();

  if (screen === 'processing') {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <Spinner size="lg" color="current" />
        <p className="text-sm font-bold text-black">{t('wallet.fiat.onramp.processingTitle', 'Payment received')}</p>
        <p className="text-xs text-gray-500">
          {t(
            'wallet.fiat.onramp.processingBody',
            'Your USDC usually arrives in a few minutes, and can take up to 15. You can close this — it lands in your wallet on its own.',
          )}
        </p>
        {/* Quien paga y cierra no vuelve a ver esta pantalla salvo que reabra el
            modal, así que tiene que alcanzarle con leerla una vez: qué esperar,
            hasta cuándo, y qué hacer si no pasa. El comprobante del banco es lo
            único que permite rastrear un pago que no acreditó. */}
        <p className="text-[11px] text-gray-400">
          {t(
            'wallet.fiat.onramp.processingHelp',
            "If it hasn't arrived after 15 minutes, keep your bank receipt and write to us:",
          )}{' '}
          {/* La casilla sale de `supportEmail()`, no escrita a mano: es la misma
              que usa el Concierge y se cambia por entorno con
              NEXT_PUBLIC_SUPPORT_EMAIL, sin tocar esta pantalla. */}
          <a href={`mailto:${supportEmail()}`} className="font-semibold text-primary">
            {supportEmail()}
          </a>
        </p>
        <PressableButton variant="success" size="cta" onClick={onDone}>
          {t('wallet.fiat.onramp.close', 'Close')}
        </PressableButton>
      </div>
    );
  }

  if (screen === 'failed') {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <p className="text-3xl">😕</p>
        <p className="text-sm font-bold text-black">{t('wallet.fiat.onramp.failedTitle', 'The purchase did not go through')}</p>
        <p className="text-xs text-gray-500">
          {reason ??
            t(
              'wallet.fiat.onramp.failedBody',
              'The provider rejected it. If your bank already took the money, it will be returned — keep the receipt.',
            )}
        </p>
        <PressableButton variant="success" size="cta" onClick={onRestart}>
          {t('wallet.fiat.onramp.restart', 'Start a new purchase')}
        </PressableButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <p className="text-3xl">🎉</p>
      <p className="text-sm font-bold text-black">{t('wallet.fiat.onramp.settledTitle', 'Your USDC is in your wallet')}</p>
      {receivedUsdc != null ? (
        <p className="text-2xl font-bold text-black">
          {t('wallet.fiat.onramp.settledAmount', '{{amount}} USDC', { amount: formatTokenFine(receivedUsdc) })}
        </p>
      ) : (
        // The provider reports the fiat that was paid, so the credited figure
        // only exists on the ledger. When that read comes back empty there is
        // nothing to say but that the money arrived — a number nobody can stand
        // behind would be worse than none.
        <p className="text-xs text-gray-500">
          {t('wallet.fiat.onramp.settledNoAmount', 'The USDC was credited to your wallet.')}
        </p>
      )}
      <p className="text-xs text-gray-500">
        {t('wallet.fiat.onramp.settledPaid', 'You paid {{amount}} {{currency}}.', { amount: amountFiat, currency })}
      </p>
      <PressableButton variant="success" size="cta" onClick={onDone}>
        {t('wallet.fiat.onramp.close', 'Close')}
      </PressableButton>
    </div>
  );
}
