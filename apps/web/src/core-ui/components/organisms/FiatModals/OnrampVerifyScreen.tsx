'use client';

import { Spinner } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { PressableButton } from '../../molecules/PressableButton';

interface OnrampVerifyScreenProps {
  /** Link de verificación del proveedor, o null si no publica ninguno. */
  url: string | null;
  /** `true` cuando se dejó de esperar por haber tardado demasiado. */
  timedOut: boolean;
  /** Vuelve a abrir el link del proveedor. */
  onOpen: () => void;
  /** Vuelve al monto para arrancar de nuevo. */
  onRestart: () => void;
}

/**
 * La compra quedó frenada hasta que el proveedor verifique al usuario.
 *
 * Se dice distinto de un error a propósito: no falló nada y no hay nada que
 * corregir, sólo falta un trámite. Y se dice distinto según haya link o no,
 * porque son dos situaciones que le piden cosas opuestas al usuario: con link
 * tiene algo que hacer, y sin link lo único que puede hacer es esperar —
 * mientras tanto preguntamos por él, así que no tiene que adivinar cuándo
 * reintentar.
 */
export function OnrampVerifyScreen({ url, timedOut, onOpen, onRestart }: OnrampVerifyScreenProps) {
  const { t } = useTranslation();

  if (timedOut) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <p className="text-sm font-bold text-black">{t('wallet.fiat.onramp.kycSlowTitle', 'Verification is taking a while')}</p>
        <p className="text-xs text-gray-500">
          {t(
            'wallet.fiat.onramp.kycSlowBody',
            'Nothing was charged. Come back later — once the provider approves you, the purchase goes through normally.',
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
      <p className="text-3xl">🪪</p>
      <p className="text-sm font-bold text-black">
        {t('wallet.fiat.onramp.kycTitle', 'The provider needs to verify your identity')}
      </p>
      {url ? (
        <>
          <p className="text-xs text-gray-500">
            {t(
              'wallet.fiat.onramp.kycLinkBody',
              'We opened the verification in another tab. Finish it there and come back — the purchase continues on its own.',
            )}
          </p>
          <PressableButton variant="success" size="cta" onClick={onOpen}>
            {t('wallet.fiat.onramp.kycOpen', 'Open verification')}
          </PressableButton>
        </>
      ) : (
        <p className="text-xs text-gray-500">
          {t(
            'wallet.fiat.onramp.kycNoLinkBody',
            'They are reviewing it now. This can take a while — leave this open and we will continue as soon as you are approved.',
          )}
        </p>
      )}
      <Spinner size="sm" color="current" />
      <p className="text-[11px] text-gray-400">{t('wallet.fiat.onramp.kycWaiting', 'Waiting for approval…')}</p>
    </div>
  );
}
