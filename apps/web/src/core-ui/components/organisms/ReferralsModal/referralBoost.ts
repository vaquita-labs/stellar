/**
 * Sistema de referidos — SOLO FRONTEND por ahora.
 *
 * El bonus de APY escala por tramos según cuántos referidos activos tengas y se
 * SUMA al APY base del depósito. Cuando exista el backend, `useReferralBoost`
 * es el único punto a cambiar: el resto de la UI ya consume su forma.
 */

export type ReferralTier = {
  /** Referidos activos mínimos para entrar al tramo. */
  referrals: number;
  /** Puntos porcentuales de APY que suma el tramo (0.25 = +0.25%). */
  bonus: number;
};

export const REFERRAL_TIERS: ReferralTier[] = [
  { referrals: 1, bonus: 0.25 },
  { referrals: 3, bonus: 0.5 },
  { referrals: 5, bonus: 1 },
  { referrals: 10, bonus: 2 },
];

/** Bonus de APY para una cantidad de referidos activos (tramo alcanzado más alto). */
export const getReferralBonus = (activeReferrals: number): number =>
  REFERRAL_TIERS.reduce((bonus, tier) => (activeReferrals >= tier.referrals ? tier.bonus : bonus), 0);

/** Siguiente tramo por alcanzar, o null si ya está en el máximo. */
export const getNextReferralTier = (activeReferrals: number): ReferralTier | null =>
  REFERRAL_TIERS.find((tier) => activeReferrals < tier.referrals) ?? null;

/**
 * Código de invitación derivado del wallet (determinista) para no depender del
 * backend todavía. Al conectar la API real, reemplazar por el código guardado.
 */
export const buildReferralCode = (walletAddress?: string | null): string => {
  if (!walletAddress) return '------';
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let hash = 0;
  for (let i = 0; i < walletAddress.length; i++) {
    hash = (hash * 31 + walletAddress.charCodeAt(i)) >>> 0;
  }
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += alphabet[hash % alphabet.length];
    hash = Math.floor(hash / alphabet.length) + (i + 1) * 7919;
  }
  return code;
};

export type ReferralBoost = {
  activeReferrals: number;
  apyBonus: number;
  totalEarnings: number;
  pendingEarnings: number;
  code: string;
  nextTier: ReferralTier | null;
};

/** Datos de referidos. Mock mientras no exista el endpoint. */
export const useReferralBoost = (walletAddress?: string | null): ReferralBoost => {
  const activeReferrals = 0;
  return {
    activeReferrals,
    apyBonus: getReferralBonus(activeReferrals),
    totalEarnings: 0,
    pendingEarnings: 0,
    code: buildReferralCode(walletAddress),
    nextTier: getNextReferralTier(activeReferrals),
  };
};
