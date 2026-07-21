'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Seconds left until the next daily check-in unlocks (next UTC midnight). */
const secondsUntilNextCheckIn = () => {
  const now = Date.now();
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0); // start of the next UTC day
  return Math.max(0, Math.floor((next.getTime() - now) / 1000));
};

const TimeTile = ({ value, label }: { value: number; label: string }) => (
  <div className="flex flex-1 min-w-0 flex-col items-center justify-center bg-white border border-black border-b-2 rounded-md py-2">
    <span className="text-2xl font-bold text-black tabular-nums leading-none">
      {value.toString().padStart(2, '0')}
    </span>
    <span className="text-[10px] uppercase text-default-500 tracking-wider mt-1">{label}</span>
  </div>
);

/**
 * Live countdown to the next daily check-in. The reward resets at UTC midnight
 * (mirrors `getCurrentDay`), so we tick every second toward that boundary.
 */
export function DailyCheckCountdown() {
  const { t } = useTranslation();
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    setSecondsLeft(secondsUntilNextCheckIn());
    const id = setInterval(() => setSecondsLeft(secondsUntilNextCheckIn()), 1000);
    return () => clearInterval(id);
  }, []);

  // Avoid SSR/client mismatch — only render once mounted.
  if (secondsLeft === null) return null;

  const hours = Math.floor(secondsLeft / 3600);
  const minutes = Math.floor((secondsLeft % 3600) / 60);
  const seconds = secondsLeft % 60;

  return (
    <div className="flex w-full flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-default-500">
        {t('rewards.countdown.comeBackIn', 'Moo! Come back in')}
      </span>
      <div className="flex gap-2">
        <TimeTile value={hours} label={t('rewards.countdown.hrs', 'Hrs')} />
        <TimeTile value={minutes} label={t('rewards.countdown.min', 'Min')} />
        <TimeTile value={seconds} label={t('rewards.countdown.sec', 'Sec')} />
      </div>
    </div>
  );
}
