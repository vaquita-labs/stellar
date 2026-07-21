'use client';

import { getJson } from '@/core-ui/api/http';
import { useConfigStore } from '@/core-ui/stores';
import { useQuery } from '@tanstack/react-query';

/**
 * Sistema de referidos, conectado al backend.
 *
 * El bonus de APY escala por tramos según cuántos referidos ACTIVOS tengas (un
 * referido es activo cuando tiene un depósito vivo) y se SUMA al APY base. El
 * cálculo vive en el servicio `referral` del backend; aquí solo consumimos su
 * resumen. La UI ya consume la forma de `ReferralBoost`, así que no cambia.
 */

export type ReferralTier = {
  /** Referidos activos mínimos para entrar al tramo. */
  referrals: number;
  /** Puntos porcentuales de APY que suma el tramo (0.25 = +0.25%). */
  bonus: number;
};

export type ReferralSummary = {
  walletAddress: string;
  code: string;
  referrals: number;
  activeReferrals: number;
  apyBonus: number;
  totalEarnings: number;
  pendingEarnings: number;
  nextTier: ReferralTier | null;
  tiers: ReferralTier[];
};

export type ReferralBoost = {
  activeReferrals: number;
  apyBonus: number;
  totalEarnings: number;
  pendingEarnings: number;
  code: string;
  nextTier: ReferralTier | null;
  tiers: ReferralTier[];
  isLoading: boolean;
};

/**
 * Tramos por defecto para renderizar la tabla mientras el resumen carga. El
 * backend es la fuente de verdad y devuelve `tiers`; estos deben coincidir.
 */
export const REFERRAL_TIERS: ReferralTier[] = [
  { referrals: 1, bonus: 0.25 },
  { referrals: 3, bonus: 0.5 },
  { referrals: 5, bonus: 1 },
  { referrals: 10, bonus: 2 },
];

const referralKey = (walletAddress?: string | null) => ['referral', 'summary', walletAddress] as const;

/**
 * Resumen de referidos del wallet. Son datos de cuenta (no del mundo/juego), así
 * que se sobrescribe el `staleTime: Infinity` global: un referido puede volverse
 * activo desde otro dispositivo y queremos verlo al reabrir, no al recargar.
 */
export const useReferralBoost = (walletAddress?: string | null): ReferralBoost => {
  const configWallet = useConfigStore((s) => s.walletAddress);
  const wallet = walletAddress ?? configWallet;

  const { data, isLoading } = useQuery<ReferralSummary | null>({
    queryKey: referralKey(wallet),
    queryFn: () => getJson<ReferralSummary>(`/referrals/wallet/${wallet}`),
    enabled: !!wallet,
    staleTime: 30_000,
  });

  return {
    activeReferrals: data?.activeReferrals ?? 0,
    apyBonus: data?.apyBonus ?? 0,
    totalEarnings: data?.totalEarnings ?? 0,
    pendingEarnings: data?.pendingEarnings ?? 0,
    code: data?.code ?? '',
    nextTier: data?.nextTier ?? null,
    tiers: data?.tiers ?? REFERRAL_TIERS,
    isLoading: isLoading && !data,
  };
};
