'use client';

import { getInterestData } from '@/core-ui/helpers';
import { useApyByLockPeriod } from '@/core-ui/hooks';
import { useConfigStore } from '@/core-ui/stores';
import { DepositResponseDTO } from '@/core-ui/types';
import { useEffect } from 'react';

export type DepositEarnings = { vaquita: number; protocol: number };

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

  const { vaquitaInterest, protocolInterest, blendInterest } = getInterestData(
    network!,
    dataApy,
    deposit.amount,
    deposit.lockPeriod,
  );
  const vaquita = vaquitaInterest;
  const protocol = protocolInterest + blendInterest;

  useEffect(() => {
    onReport(deposit.id, { vaquita, protocol });
  }, [deposit.id, vaquita, protocol, onReport]);

  return null;
};
