import i18n from '../i18n';
import { ONE_DAY } from '../config/constants';

export async function withTimeout<T>(p: Promise<T>, ms: number, tag = 'op'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`[timeout] ${tag} > ${ms}ms`)), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

export const formatTime = (seconds: number): string => {
  if (seconds === 0) return i18n.t('deposit.detail.readyToWithdraw', 'Ready to withdraw');

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m ${remainingSeconds}s`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    return `${remainingSeconds}s`;
  }
};

export const formatTimeDeposit = (milliseconds: number): string => {
  const seconds = Math.abs(milliseconds) / 1000;
  const months = Math.floor(seconds / 2592000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (months > 0) {
    return i18n.t('common.time.month', { count: months });
  } else if (days > 0) {
    return i18n.t('common.time.day', { count: days });
  } else if (hours > 0) {
    return i18n.t('common.time.hour', { count: hours });
  } else if (minutes > 0) {
    return i18n.t('common.time.minute', { count: minutes });
  } else {
    return `${remainingSeconds}s`;
  }
};

/**
 * Units the ramp provider can name in its free-form ETA string.
 *
 * Both English and Spanish spellings are matched because the value is whatever
 * the provider wrote, not something this app controls.
 */
type EtaUnit = 'minute' | 'hour' | 'day' | 'month';

const ETA_UNITS: readonly (readonly [RegExp, EtaUnit])[] = [
  [/\bmin(?:ute)?s?\b|\bminutos?\b/i, 'minute'],
  [/\bhours?\b|\bhrs?\b|\bhoras?\b/i, 'hour'],
  [/\bdays?\b|\bd[ií]as?\b/i, 'day'],
  [/\bmonths?\b|\bmes(?:es)?\b/i, 'month'],
];

// Written out instead of built from the unit so every key stays greppable.
const ETA_COUNT_KEY: Record<EtaUnit, string> = {
  minute: 'common.time.minute',
  hour: 'common.time.hour',
  day: 'common.time.day',
  month: 'common.time.month',
};

const ETA_APPROX_KEY: Record<EtaUnit, string> = {
  minute: 'common.time.approxMinutes',
  hour: 'common.time.approxHours',
  day: 'common.time.approxDays',
  month: 'common.time.approxMonths',
};

/** A unit standing on its own, give or take an approximation marker: `~minutes`. */
const BARE_UNIT = /^[~≈]?\s*(?:about|around|approx\.?|approximately)?\s*[a-zá-ú]+$/i;

/**
 * Turns the ramp provider's free-form estimate into one localized phrase.
 *
 * The value arrives as prose written by the provider, in English, in shapes
 * like `~5 minutes`, `5-10 minutes` and `~minutes` — that last one, with the
 * number missing, is what reaches the screen as a bare `~minutes`. A range
 * collapses to its upper bound so the result stays one short phrase.
 *
 * Anything that cannot be read confidently is returned untouched, because
 * showing the provider's own words beats inventing a duration they never
 * quoted. That covers both an unknown unit (`instant`) and prose that merely
 * mentions one (`same business day` is not `a few days`).
 */
export const formatRampEta = (raw: string): string => {
  const text = raw.trim();
  if (!text) return '';

  const unit = ETA_UNITS.find(([pattern]) => pattern.test(text))?.[1];
  if (!unit) return text;

  const counts = text.match(/\d+/g)?.map(Number) ?? [];
  if (counts.length === 0) return BARE_UNIT.test(text) ? i18n.t(ETA_APPROX_KEY[unit]) : text;

  const time = i18n.t(ETA_COUNT_KEY[unit], { count: Math.max(...counts) });
  return counts.length > 1 ? i18n.t('common.time.upTo', { time }) : time;
};

export const getCurrentDay = (date: Date) => {
  return Math.ceil(date.getTime() / ONE_DAY);
};
