'use client';

import React from 'react';
import { FiMail, FiUserPlus } from 'react-icons/fi';
import { PageLayout } from '../../molecules';

export function FriendsPage() {
  return (
    <PageLayout title="Friends" backHref="/profile">
      <section className="rounded-lg border border-black border-b-2 bg-white p-6 sm:p-8 text-center flex flex-col items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#DDF4FF] border border-[#84D8FF]">
            <FiUserPlus className="h-8 w-8 text-black" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-black">No friends yet</h2>
            <p className="text-sm text-gray-600 mt-1">
              Soon you&apos;ll be able to invite friends, see their progress and save together in shared pools.
            </p>
          </div>
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md border border-black border-b-2 bg-primary/30 text-black text-sm font-semibold opacity-70 cursor-not-allowed max-w-full"
          >
            <FiMail className="h-4 w-4 shrink-0" />
            <span className="truncate">Invite a friend</span>
            <span className="text-[10px] font-bold uppercase tracking-wide bg-primary text-black border border-black rounded-sm px-1.5 py-0.5 shrink-0">
              Soon
            </span>
          </button>
        </section>

        <section className="rounded-lg border border-black border-b-2 bg-white p-4 sm:p-6">
          <h3 className="text-sm font-semibold text-black mb-2">Why friends?</h3>
          <ul className="text-sm text-gray-700 space-y-2 list-disc pl-5">
            <li>Compete on the leaderboard with people you know.</li>
            <li>Earn shared rewards by hitting savings goals together.</li>
            <li>Get reminders if a friend keeps their streak alive.</li>
          </ul>
        </section>
    </PageLayout>
  );
}
