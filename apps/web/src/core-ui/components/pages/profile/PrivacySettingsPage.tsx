'use client';

import { Switch } from '@heroui/react';
import Link from 'next/link';
import React from 'react';
import { FiArrowLeft, FiEye, FiEyeOff, FiInfo } from 'react-icons/fi';
import { usePrivacyStore } from '../../../stores';

function ToggleCard({
  icon,
  title,
  description,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 px-4 py-4 rounded-2xl border border-black border-b-2 bg-white cursor-pointer hover:bg-[#FFF7E6] transition">
      <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#DDF4FF] border border-[#84D8FF] text-black shrink-0">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-extrabold text-black">{title}</p>
        <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{description}</p>
      </div>
      <Switch
        isSelected={value}
        onChange={(checked) => onChange(checked)}
        aria-label={title}
      />
    </label>
  );
}

export function PrivacySettingsPage() {
  const hideBalance = usePrivacyStore((s) => s.hideBalance);
  const setHideBalance = usePrivacyStore((s) => s.setHideBalance);

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-5 sm:py-6 flex flex-col gap-6 pb-16">
        {/* Header */}
        <header className="flex flex-col gap-4">
          <Link
            href="/profile/settings"
            aria-label="Back"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white border border-black border-b-2 text-black hover:bg-white/80 transition"
          >
            <FiArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-black tracking-tight">
              Privacy settings
            </h1>
            <p className="text-sm text-gray-600">
              Decide how much of your activity is visible on this device.
            </p>
          </div>
        </header>

        {/* Hide balance */}
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-gray-500 px-1">
            Visibility
          </h2>
          <ToggleCard
            icon={hideBalance ? <FiEyeOff className="h-4 w-4" /> : <FiEye className="h-4 w-4" />}
            title="Hide my balance"
            description="Mask your active deposits and totals on the profile and home screens. Toggle it off any time to see them again."
            value={hideBalance}
            onChange={setHideBalance}
          />
        </section>

        {/* Helpful note */}
        <section className="rounded-2xl border border-black border-b-2 bg-white p-4 flex items-start gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#FFF7E6] border border-primary text-black shrink-0">
            <FiInfo className="h-4 w-4" />
          </span>
          <div className="flex flex-col gap-1 min-w-0">
            <p className="text-sm font-extrabold text-black">Stored on this device</p>
            <p className="text-xs text-gray-600 leading-relaxed">
              Privacy preferences are saved locally and don&apos;t sync to other devices yet.
              We&apos;ll add cross-device sync once accounts ship.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
