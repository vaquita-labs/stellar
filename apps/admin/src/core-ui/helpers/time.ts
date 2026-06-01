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
  if (seconds === 0) return 'Ready to withdraw';

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
    return `${months === 1 ? '1 month' : `${months} months`}`;
  } else if (days > 0) {
    return `${days === 1 ? '1 day' : `${days} days`}`;
  } else if (hours > 0) {
    return `${hours === 1 ? '1 hour' : `${hours} hours`}`;
  } else if (minutes > 0) {
    return `${minutes === 1 ? '1 minute' : `${minutes} minutes`}`;
  } else {
    return `${remainingSeconds}s`;
  }

};