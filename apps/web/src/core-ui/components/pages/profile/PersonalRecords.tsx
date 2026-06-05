'use client';

import Image from 'next/image';
import React from 'react';

interface RecordCardProps {
  icon: string;
  background: string;
  title: string;
  value: React.ReactNode;
  date: string;
}

function RecordCard({ icon, background, title, value, date }: RecordCardProps) {
  return (
    <div className="shrink-0 w-40 sm:w-44 snap-start rounded-3xl border border-black/10 px-3 pt-3 pb-3 flex flex-col items-center gap-1.5">
      <div className="relative w-full aspect-square flex items-center justify-center">
        <span
          aria-hidden
          className="absolute inset-3 rounded-full blur-2xl opacity-65"
          style={{ background }}
        />
        <Image
          src={icon}
          alt={title}
          width={240}
          height={240}
          className="relative h-full w-full object-contain drop-shadow-md"
        />
      </div>
      <div className="flex flex-col items-center text-center min-w-0 w-full leading-tight">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 truncate w-full">
          {title}
        </span>
        <span className="text-xl font-extrabold text-black tabular-nums leading-none mt-0.5">
          {value}
        </span>
        <span className="text-[10px] text-gray-400 leading-none mt-1">{date}</span>
      </div>
    </div>
  );
}

const formatInt = (n: number) =>
  Math.floor(n).toLocaleString(undefined, { maximumFractionDigits: 0 });

export interface PersonalRecordsProps {
  totalStreak: number;
  experience: number;
  totalDeposits: number;
  goldCoins: number;
  earned: number;
  totalAchievements: number;
  date: string;
}

export function PersonalRecords({
  totalStreak,
  experience,
  totalDeposits,
  goldCoins,
  earned,
  totalAchievements,
  date,
}: PersonalRecordsProps) {
  return (
    <div
      className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 [scrollbar-width:thin] [scrollbar-color:rgba(0,0,0,0.3)_transparent] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:bg-black/30 [&::-webkit-scrollbar-thumb]:rounded-full snap-x"
      aria-label="Personal records"
    >
      <RecordCard
        icon="/icons/achievements/streak-master.png"
        background="linear-gradient(180deg, #FFB347 0%, #FF7A00 100%)"
        title="Day streak"
        value={`${formatInt(totalStreak)} ${totalStreak === 1 ? 'day' : 'days'}`}
        date={date}
      />
      <RecordCard
        icon="/icons/achievements/explorer.png"
        background="linear-gradient(180deg, #FFE082 0%, #F5A161 100%)"
        title="Total XP"
        value={formatInt(experience)}
        date={date}
      />
      <RecordCard
        icon="/icons/achievements/first-deposit.png"
        background="linear-gradient(180deg, #C6F1A8 0%, #58CC02 100%)"
        title="Active deposits"
        value={formatInt(totalDeposits)}
        date={date}
      />
      <RecordCard
        icon="/icons/achievements/first-place.png"
        background="linear-gradient(180deg, #FFE082 0%, #FFA000 100%)"
        title="Gold coins"
        value={formatInt(goldCoins)}
        date={date}
      />
      <RecordCard
        icon="/icons/achievements/beta-tester2.png"
        background="linear-gradient(180deg, #BBDEFB 0%, #1E88E5 100%)"
        title="Awards earned"
        value={`${formatInt(earned)} / ${formatInt(totalAchievements)}`}
        date={date}
      />
    </div>
  );
}
