'use client';

import { ReactNode } from 'react';
import { FiAlertCircle, FiCheckCircle } from 'react-icons/fi';

export type NoticeTone = 'ok' | 'warn';

const TONE_CLASSES: Record<NoticeTone, string> = {
  ok: 'border-[#9ED36A] bg-[#E8F5D6] text-[#3F9102]',
  warn: 'border-[#F0B429] bg-[#FFF7E6] text-[#9A6B00]',
};

/**
 * The app's soft status card, shared by every sheet that has something to say
 * beside its content: a wallet still to protect, an address that changes, a
 * step the provider waits on. The tone carries the weight (green for done,
 * amber for a heads-up) so the sentence can stay short and never red.
 */
export function Notice({ tone, children, className = '' }: { tone: NoticeTone; children: ReactNode; className?: string }) {
  const Icon = tone === 'ok' ? FiCheckCircle : FiAlertCircle;
  return (
    <div
      role={tone === 'warn' ? 'alert' : 'status'}
      className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${TONE_CLASSES[tone]} ${className}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-black">{children}</div>
    </div>
  );
}
