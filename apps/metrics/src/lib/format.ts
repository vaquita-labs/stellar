export const fmtInt = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
export const fmtUsd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
export const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
export const fmtDate = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

/** Change vs the previous period, rendered as "+12.5%" / "−3.0%" / "—". */
export const fmtDelta = (current: number, previous: number): string => {
  if (!previous) return current ? 'new' : '—';
  const d = (current - previous) / previous;
  return `${d >= 0 ? '+' : '−'}${Math.abs(d * 100).toFixed(1)}%`;
};

/** ms → human lock-period label ("7d", "30d"). */
export const fmtLockPeriod = (ms: number) => {
  const days = Math.round(ms / 86_400_000);
  if (days >= 1) return `${days}d`;
  const hours = Math.round(ms / 3_600_000);
  return hours >= 1 ? `${hours}h` : `${Math.round(ms / 60_000)}m`;
};
