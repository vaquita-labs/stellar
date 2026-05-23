'use client';

import React, { useMemo, useState } from 'react';
import { FiChevronDown, FiMail, FiMessageCircle, FiSearch } from 'react-icons/fi';
import { MockedSubPageLayout } from './MockedSubPageLayout';

type FaqEntry = { id: string; q: string; a: string; tags: string[] };

const FAQS: FaqEntry[] = [
  {
    id: 'what-is',
    q: 'What is Vaquita?',
    a: 'Vaquita is a non-custodial savings app that lets you deposit funds into audited DeFi vaults on supported blockchains. We add gamification (streaks, badges, XP) to help you stick to your saving goals.',
    tags: ['getting started'],
  },
  {
    id: 'custody',
    q: 'Does Vaquita hold my money?',
    a: 'No. Vaquita is fully non-custodial. Your funds live in smart contracts and only you, with your wallet keys, can move them. We never see or touch your private keys.',
    tags: ['security', 'wallet'],
  },
  {
    id: 'apy',
    q: 'How is my APY calculated?',
    a: "Your APY is the underlying protocol APY (e.g. lending markets) plus any Vaquita rewards active for your lock period. The breakdown is shown in the home header — tap your balance to expand it.",
    tags: ['yield', 'apy'],
  },
  {
    id: 'streak',
    q: 'How do streaks work?',
    a: "Every day you visit the app and have at least one active deposit, your streak grows by 1. Miss a day and the streak resets — unless you have a streak-freeze power-up (coming soon).",
    tags: ['streaks', 'gamification'],
  },
  {
    id: 'withdraw',
    q: 'Can I withdraw my money anytime?',
    a: "If you chose a flexible lock period (0 days), yes. Locked deposits release after their term ends. Withdrawing before the term is not supported in this version.",
    tags: ['wallet', 'withdrawals'],
  },
  {
    id: 'badges',
    q: 'What are monthly badges?',
    a: "Each month we issue badges to vaqueros who completed savings goals. The current-month badge is shown bright; past months that you missed appear locked.",
    tags: ['gamification'],
  },
  {
    id: 'support',
    q: 'How do I contact support?',
    a: "Email us at hello@vaquita.finance and we'll get back within 48 hours. Once Feedback ships, you'll be able to send messages right from the app.",
    tags: ['support'],
  },
];

function AccordionItem({ entry, isOpen, onToggle }: { entry: FaqEntry; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-gray-200 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-4 text-left bg-transparent hover:bg-[#FFF7E6] transition"
        aria-expanded={isOpen}
      >
        <span className="text-[15px] font-extrabold text-black">{entry.q}</span>
        <FiChevronDown
          className={`text-gray-500 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && (
        <div className="px-4 pb-4 pt-1">
          <p className="text-sm text-gray-700 leading-relaxed">{entry.a}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {entry.tags.map((t) => (
              <span
                key={t}
                className="text-[10px] font-bold uppercase tracking-wide bg-[#DDF4FF] border border-[#84D8FF] text-black rounded-sm px-1.5 py-0.5"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function HelpCenterPage() {
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(FAQS[0]?.id ?? null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQS;
    return FAQS.filter(
      (f) =>
        f.q.toLowerCase().includes(q) ||
        f.a.toLowerCase().includes(q) ||
        f.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [query]);

  return (
    <MockedSubPageLayout
      title="Help center"
      subtitle="Answers to the questions vaqueros ask the most."
    >
      {/* Search */}
      <div className="relative">
        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 h-4 w-4" />
        <input
          type="search"
          inputMode="search"
          placeholder="Search the FAQ…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full h-12 pl-10 pr-3 rounded-md bg-white border border-black border-b-2 text-sm font-medium text-black placeholder:text-gray-400 outline-none focus:border-primary"
        />
      </div>

      {/* FAQ */}
      <section className="rounded-2xl border border-black border-b-2 bg-white overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm font-bold text-black">No results for &ldquo;{query}&rdquo;</p>
            <p className="text-xs text-gray-500 mt-1">Try a different keyword or contact us below.</p>
          </div>
        ) : (
          filtered.map((entry) => (
            <AccordionItem
              key={entry.id}
              entry={entry}
              isOpen={openId === entry.id}
              onToggle={() => setOpenId(openId === entry.id ? null : entry.id)}
            />
          ))
        )}
      </section>

      {/* Contact channels */}
      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-extrabold uppercase tracking-wider text-gray-500 px-1">
          Still stuck?
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a
            href="mailto:hello@vaquita.finance"
            className="flex items-center gap-3 px-4 py-4 rounded-2xl border border-black border-b-2 bg-white hover:-translate-y-0.5 hover:bg-[#FFF7E6] transition"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#DDF4FF] border border-[#84D8FF] text-black">
              <FiMail className="h-4 w-4" />
            </span>
            <div className="flex flex-col">
              <span className="text-sm font-extrabold text-black">Email support</span>
              <span className="text-xs text-gray-600">hello@vaquita.finance</span>
            </div>
          </a>
          <div className="flex items-center gap-3 px-4 py-4 rounded-2xl border border-black border-b-2 bg-white opacity-60">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#DDF4FF] border border-[#84D8FF] text-black">
              <FiMessageCircle className="h-4 w-4" />
            </span>
            <div className="flex flex-col">
              <span className="text-sm font-extrabold text-black">Live chat</span>
              <span className="text-xs text-gray-600">Coming soon</span>
            </div>
          </div>
        </div>
      </section>
    </MockedSubPageLayout>
  );
}
