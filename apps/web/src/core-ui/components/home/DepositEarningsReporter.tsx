'use client';

import { getInterestData } from '@/core-ui/helpers';
import { useApyByLockPeriod } from '@/core-ui/hooks';
import { useConfigStore } from '@/core-ui/stores';
import { DepositResponseDTO } from '@/core-ui/types';
import { useEffect } from 'react';

export type DepositEarnings = {
  vaquita: number;
  protocol: number;
  /** Interés que devenga el depósito por milisegundo (rendimiento lineal hasta el vencimiento). */
  ratePerMs: number;
  /** Tope: el interés total proyectado, para que el contador no siga después del vencimiento. */
  maxInterest: number;
};

/**
 * Renderless helper: computes a single deposit's *projected* earnings from the
 * live APY for its own lock period (same calc the deposit card shows) and
 * reports it up. Used to aggregate the "Estimated earnings total", since APY is
 * fetched per lock period via a hook and can't be looped over directly.
 */
export const DepositEarningsReporter = ({
  deposit,
  onReport,
}: {
  deposit: DepositResponseDTO;
  onReport: (id: number, earnings: DepositEarnings) => void;
}) => {
  const { network, token } = useConfigStore();
  const { data: dataApy } = useApyByLockPeriod(deposit.lockPeriod, token?.symbol ?? '');

  const { vaquitaInterest, protocolInterest, blendInterest, totalInterest } = getInterestData(
    network!,
    dataApy,
    deposit.amount,
    deposit.lockPeriod,
  );
  const vaquita = vaquitaInterest;
  const protocol = protocolInterest + blendInterest;
  // El interés proyectado se reparte linealmente sobre el lock period: así el
  // saldo del header puede avanzar en vivo sin pedirle nada al servidor.
  const ratePerMs = deposit.lockPeriod > 0 ? totalInterest / deposit.lockPeriod : 0;

  useEffect(() => {
    onReport(deposit.id, { vaquita, protocol, ratePerMs, maxInterest: totalInterest });
  }, [deposit.id, vaquita, protocol, ratePerMs, totalInterest, onReport]);

  return null;
};
