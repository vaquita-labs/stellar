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

export const getCurrentDay = (date: Date) => {
  return Math.ceil(date.getTime() / ONE_DAY);
};
