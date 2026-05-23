'use client';

import Image from 'next/image';
import React, { useDeferredValue, useMemo, useState } from 'react';
import { FiCheck, FiSearch, FiUserPlus } from 'react-icons/fi';
import { MockedSubPageLayout } from './MockedSubPageLayout';

type Vaquero = {
  id: string;
  name: string;
  handle: string;
  level: number;
  streak: number;
  followers: number;
};

const DIRECTORY: Vaquero[] = [
  { id: 'v-1', name: 'Rafaela Quiroz', handle: '@rafaela', level: 8, streak: 41, followers: 124 },
  { id: 'v-2', name: 'Zulma Hidalgo', handle: '@zulma', level: 5, streak: 12, followers: 88 },
  { id: 'v-3', name: 'Camilo Restrepo', handle: '@camilo', level: 12, streak: 73, followers: 312 },
  { id: 'v-4', name: 'Daniela Páez', handle: '@danip', level: 3, streak: 6, followers: 22 },
  { id: 'v-5', name: 'Tomás León', handle: '@tomasl', level: 9, streak: 30, followers: 65 },
  { id: 'v-6', name: 'Sofía Castro', handle: '@sofic', level: 7, streak: 19, followers: 154 },
  { id: 'v-7', name: 'Bianka Arce', handle: '@biankarce', level: 4, streak: 9, followers: 47 },
  { id: 'v-8', name: 'Carlos Jhesid', handle: '@cjhesid', level: 6, streak: 22, followers: 91 },
  { id: 'v-9', name: 'Andrea Alvarez', handle: '@aalvarez', level: 11, streak: 56, followers: 203 },
  { id: 'v-10', name: 'Mateo Velez', handle: '@mateovz', level: 2, streak: 4, followers: 13 },
];

export function SearchFriendsPage() {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [following, setFollowing] = useState<Set<string>>(new Set());

  const results = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return DIRECTORY.slice(0, 6);
    return DIRECTORY.filter(
      (v) => v.name.toLowerCase().includes(q) || v.handle.toLowerCase().includes(q)
    );
  }, [deferredQuery]);

  const toggleFollow = (id: string) => {
    setFollowing((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <MockedSubPageLayout
      title="Search by name"
      subtitle="Find other vaqueros by their name or @handle."
      backHref="/profile/friends"
    >
      {/* Search */}
      <div className="relative">
        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 h-4 w-4" />
        <input
          type="search"
          inputMode="search"
          autoFocus
          placeholder="Try “rafaela” or “@camilo”…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full h-12 pl-10 pr-3 rounded-md bg-white border border-black border-b-2 text-sm font-medium text-black placeholder:text-gray-400 outline-none focus:border-primary"
        />
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-gray-500">
            {query.trim() ? 'Results' : 'Popular vaqueros'}
          </h2>
          <span className="text-[11px] font-bold text-gray-500 tabular-nums">
            {results.length}
          </span>
        </div>

        {results.length === 0 ? (
          <div className="rounded-2xl border border-black border-b-2 bg-white p-6 text-center">
            <p className="text-sm font-bold text-black">No vaqueros match &ldquo;{query}&rdquo;</p>
            <p className="text-xs text-gray-500 mt-1">Double-check the name or try the @handle.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {results.map((v) => {
              const isFollowed = following.has(v.id);
              return (
                <li
                  key={v.id}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-black border-b-2 bg-white"
                >
                  <div className="h-12 w-12 rounded-full bg-[#FFE7C7] border-2 border-black flex items-center justify-center overflow-hidden shrink-0">
                    <Image
                      src="/vaquita/vaquita_isotipo.svg"
                      alt={v.name}
                      width={40}
                      height={40}
                      className="object-contain"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-extrabold text-black truncate">{v.name}</p>
                    <p className="text-xs text-gray-500 truncate">{v.handle}</p>
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-[#DDF4FF] border border-[#84D8FF] text-black rounded-sm px-1.5 py-0.5">
                        Lvl {v.level}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/30 border border-black/30 text-black rounded-sm px-1.5 py-0.5">
                        🔥 {v.streak}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                        {v.followers} followers
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleFollow(v.id)}
                    className={`h-9 px-3 inline-flex items-center gap-1.5 rounded-md text-xs font-extrabold uppercase tracking-wider border border-black border-b-2 transition hover:-translate-y-0.5 shrink-0 ${
                      isFollowed
                        ? 'bg-white text-black hover:bg-white/80'
                        : 'bg-primary text-black hover:bg-primary/80'
                    }`}
                    aria-pressed={isFollowed}
                  >
                    {isFollowed ? (
                      <>
                        <FiCheck className="h-3.5 w-3.5" />
                        Following
                      </>
                    ) : (
                      <>
                        <FiUserPlus className="h-3.5 w-3.5" />
                        Follow
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </MockedSubPageLayout>
  );
}
