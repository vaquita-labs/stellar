'use client';

import { Spinner, toast } from '@heroui/react';
import { usePollar } from '@pollar/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUsdcTrustline } from '@/core-ui/hooks/useUsdcTrustline';
import { PressableButton } from './PressableButton';

interface UsdcTrustlineGateProps {
  /** Cuenta que va a recibir el USDC; `null` apaga la consulta y el aviso. */
  address: string | null;
  issuer: string | undefined;
  /** Texto del aviso; por defecto, el del bridge. */
  message?: string;
}

/**
 * Aviso + botón para activar el USDC en la wallet del usuario cuando todavía no
 * puede recibirlo. No renderiza nada si ya puede (o mientras no se sabe).
 *
 * Comparte la query de `useUsdcTrustline` con quien lo monta: la misma key, así
 * que el `refetch` de acá después de activar le llega también al que decide si
 * dejar avanzar.
 */
export function UsdcTrustlineGate({ address, issuer, message }: UsdcTrustlineGateProps) {
  const { t } = useTranslation();
  const { setTrustline } = usePollar();
  const trustline = useUsdcTrustline(address, issuer);
  const [activating, setActivating] = useState(false);

  const needsTrustline = trustline.data === 'missing' || trustline.data === 'unfunded';
  if (!needsTrustline) return null;

  const handleActivate = async () => {
    if (!issuer) return;
    setActivating(true);
    try {
      const outcome = await setTrustline({ code: 'USDC', issuer });
      if (outcome.status === 'error') throw new Error(outcome.details ?? 'trustline failed');
      await trustline.refetch();
    } catch {
      toast.danger(t('wallet.bridge.trustlineError', 'Could not activate USDC. Please try again.'));
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[#F0B429] bg-[#FFF7E6] px-4 py-3">
      <p className="text-sm text-black">
        {message ?? t('wallet.bridge.trustlineNeeded', 'Your wallet needs to activate USDC before it can receive it.')}
      </p>
      <PressableButton variant="primary" size="md" onClick={handleActivate} disabled={activating}>
        {activating ? (
          <>
            <Spinner size="sm" color="current" />
            {t('wallet.bridge.activating', 'Activating…')}
          </>
        ) : (
          t('wallet.bridge.activateTrustline', 'Activate USDC')
        )}
      </PressableButton>
    </div>
  );
}
