'use client';

import { Popover } from '@heroui/react';
import Image from 'next/image';
import { ReactNode } from 'react';
import { FiArrowDown, FiArrowUp, FiCheck, FiFilter, FiSearch, FiX } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';

/* ------------------------------------------------------------------ */
/* Sort options                                                        */
/* ------------------------------------------------------------------ */

export type SortKey = 'rank' | 'level' | 'streak' | 'badges';
export type SortDirection = 'asc' | 'desc';

/** Inline helper for the global PNG glyphs we use in this filter. */
const GlobalIcon = ({ name, alt }: { name: 'trophy' | 'star' | 'streak_face' | 'coin' | 'best_position'; alt: string }) => (
  <Image
    src={`/icons/global/${name}.png`}
    alt={alt}
    width={20}
    height={20}
    className="object-contain"
  />
);

export const SORT_OPTIONS: { key: SortKey; label: string; icon: ReactNode; hint: string }[] = [
  { key: 'rank', label: 'Top ranking', icon: <GlobalIcon name="best_position" alt="" />, hint: 'Default leaderboard order' },
  { key: 'level', label: 'Level', icon: <GlobalIcon name="star" alt="" />, hint: 'Most XP earned' },
  { key: 'streak', label: 'Streak', icon: <GlobalIcon name="streak_face" alt="" />, hint: 'Most consecutive days' },
  { key: 'badges', label: 'Badges', icon: <GlobalIcon name="trophy" alt="" />, hint: 'Most achievements unlocked' },
];

/* ------------------------------------------------------------------ */
/* Search input                                                        */
/* ------------------------------------------------------------------ */

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="relative flex-1 min-w-0">
      <FiSearch
        aria-hidden
        className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500"
      />
      <input
        type="search"
        inputMode="search"
        placeholder={t('leaderboard.search.placeholder', 'Search vaqueros by username')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-9 pl-9 pr-8 rounded-full bg-white border border-black border-b-2 text-sm font-medium text-black placeholder:text-gray-400 outline-none focus:border-primary"
        aria-label={t('leaderboard.search.label', 'Search vaqueros')}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={t('leaderboard.search.clear', 'Clear search')}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-full bg-black/5 hover:bg-black/10 transition"
        >
          <FiX className="h-3 w-3 text-black" />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Filter dropdown (funnel)                                            */
/* ------------------------------------------------------------------ */

function FilterDropdown({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (key: SortKey) => void;
}) {
  const { t } = useTranslation();
  const active = value !== 'rank';
  return (
    <Popover>
      <Popover.Trigger>
        <button
          type="button"
          aria-label={t('leaderboard.filter.label', 'Filter by metric')}
          className={`relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black border-b-2 transition ${
            active ? 'bg-primary text-black' : 'bg-white text-black hover:bg-white/80'
          }`}
        >
          <FiFilter className="h-3.5 w-3.5" />
          {active && (
            <span
              aria-hidden
              className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-black"
            />
          )}
        </button>
      </Popover.Trigger>
      <Popover.Content placement="bottom end">
        <Popover.Dialog className="bg-white rounded-2xl border border-black border-b-2 p-2 w-64 shadow-md">
          <div className="px-2 py-1.5">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-500">
              {t('leaderboard.filter.heading', 'Filter by')}
            </p>
          </div>
          <ul className="flex flex-col gap-0.5">
            {SORT_OPTIONS.map((opt) => {
              const selected = opt.key === value;
              return (
                <li key={opt.key}>
                  <button
                    type="button"
                    onClick={() => onChange(opt.key)}
                    className={`w-full flex items-center gap-3 rounded-xl px-2.5 py-2 text-left transition ${
                      selected ? 'bg-primary/30' : 'hover:bg-black/5'
                    }`}
                  >
                    <span className="text-lg leading-none flex items-center justify-center w-5">
                      {opt.icon}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-extrabold text-black truncate">
                        {t(`leaderboard.sortOptions.${opt.key}.label`, opt.label)}
                      </span>
                      <span className="block text-[10px] text-gray-500 truncate">
                        {t(`leaderboard.sortOptions.${opt.key}.hint`, opt.hint)}
                      </span>
                    </span>
                    {selected && <FiCheck className="h-4 w-4 text-black shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/* Direction toggle (asc / desc)                                       */
/* ------------------------------------------------------------------ */

function DirectionToggle({
  value,
  onChange,
}: {
  value: SortDirection;
  onChange: (dir: SortDirection) => void;
}) {
  const { t } = useTranslation();
  const isDesc = value === 'desc';
  return (
    <button
      type="button"
      onClick={() => onChange(isDesc ? 'asc' : 'desc')}
      aria-label={
        isDesc
          ? t('leaderboard.direction.descending', 'Sort descending — toggle order')
          : t('leaderboard.direction.ascending', 'Sort ascending — toggle order')
      }
      aria-pressed={isDesc}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white border border-black border-b-2 text-black hover:bg-white/80 transition"
    >
      {isDesc ? <FiArrowDown className="h-3.5 w-3.5" /> : <FiArrowUp className="h-3.5 w-3.5" />}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-header                                                          */
/* ------------------------------------------------------------------ */

interface LeaderboardSubHeaderProps {
  query: string;
  onQueryChange: (v: string) => void;
  sortKey: SortKey;
  onSortChange: (key: SortKey) => void;
  direction: SortDirection;
  onDirectionChange: (dir: SortDirection) => void;
}

/**
 * Compact filter row sitting under the page title — a search field that
 * narrows by username, plus two pill buttons: a funnel that opens the
 * sort-metric dropdown, and an arrow that flips asc/desc.
 */
export function LeaderboardSubHeader({
  query,
  onQueryChange,
  sortKey,
  onSortChange,
  direction,
  onDirectionChange,
}: LeaderboardSubHeaderProps) {
  return (
    <div className="flex items-center gap-2">
      <SearchInput value={query} onChange={onQueryChange} />
      <FilterDropdown value={sortKey} onChange={onSortChange} />
      <DirectionToggle value={direction} onChange={onDirectionChange} />
    </div>
  );
}
