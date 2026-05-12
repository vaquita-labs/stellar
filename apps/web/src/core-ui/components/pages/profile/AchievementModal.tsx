'use client';

import { Modal, toast } from '@heroui/react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import React from 'react';
import { FiShare2, FiX } from 'react-icons/fi';

export type AchievementDetail = {
  id: string;
  title: string;
  description: string;
  icon: string;
  /** ISO date string or display string for when it was unlocked. */
  date?: string;
  /** Tier label like "Level 3" or "Rubí". Optional. */
  tier?: string;
  /** Progress (current / target). When provided, a progress bar is rendered. */
  progress?: { current: number; target: number };
  /** Background color for the icon container. */
  accent?: string;
};

interface AchievementModalProps {
  achievement: AchievementDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formatDate = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
};

export function AchievementModal({ achievement, open, onOpenChange }: AchievementModalProps) {
  const handleShare = async () => {
    if (!achievement) return;
    const text = `I just unlocked "${achievement.title}" on Vaquita 🐮`;
    const url = typeof window !== 'undefined' ? window.location.origin : 'https://vaquita.finance';

    try {
      if (typeof navigator !== 'undefined' && (navigator as Navigator & { share?: unknown }).share) {
        await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
          title: achievement.title,
          text,
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(`${text} — ${url}`);
      toast.success('Link copied to clipboard');
    } catch (error) {
      const message = (error as { message?: string })?.message ?? '';
      if (message && !message.toLowerCase().includes('abort')) {
        toast.danger('Could not share', { description: message });
      }
    }
  };

  if (!achievement) return null;

  const progressPct = achievement.progress
    ? Math.min(100, Math.round((achievement.progress.current / achievement.progress.target) * 100))
    : null;

  return (
    <Modal.Backdrop
      isOpen={open}
      isDismissable
      onOpenChange={(o) => {
        if (!o) onOpenChange(false);
      }}
      className="bg-black/70 backdrop-blur-sm data-[exiting=true]:duration-300"
    >
      <Modal.Container
        size="full"
        placement="bottom"
        scroll="inside"
        className="p-0! m-0!"
      >
        <Modal.Dialog
          className="bg-background m-0! p-0! rounded-t-3xl sm:rounded-t-[2rem] border-0 max-h-[100dvh] data-[exiting=true]:duration-300"
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 280, damping: 32 }}
            className="flex flex-col h-full min-h-[100dvh] w-full"
          >
            {/* Close button */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-background/95 backdrop-blur-sm">
              <span className="w-10" />
              <span className="h-1.5 w-12 rounded-full bg-black/15" aria-hidden />
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white border border-black border-b-2 text-black hover:-translate-y-0.5 transition"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            <Modal.Body className="flex-1 px-6 sm:px-10 pb-8 pt-2 flex flex-col items-center justify-start gap-8 overflow-y-auto">
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 220, damping: 18 }}
                className="flex flex-col items-center gap-4 pt-4"
              >
                <div
                  className="relative flex h-44 w-44 sm:h-52 sm:w-52 items-center justify-center rounded-full border-2 border-black border-b-4 shadow-lg overflow-hidden"
                  style={{ background: achievement.accent ?? 'linear-gradient(180deg, #FFD64A 0%, #F5A161 100%)' }}
                >
                  <Image
                    src={achievement.icon}
                    alt={achievement.title}
                    width={140}
                    height={140}
                    className="object-contain drop-shadow"
                  />
                </div>
                {achievement.tier && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider bg-primary text-black border border-black rounded-full px-3 py-1">
                    {achievement.tier}
                  </span>
                )}
              </motion.div>

              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.25, duration: 0.4 }}
                className="text-center max-w-md flex flex-col items-center gap-3"
              >
                <h2 className="text-2xl sm:text-3xl font-extrabold text-black">{achievement.title}</h2>
                <p className="text-sm sm:text-base text-gray-700 leading-relaxed">
                  {achievement.description}
                </p>
                {achievement.date && (
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Unlocked · {formatDate(achievement.date)}
                  </p>
                )}
              </motion.div>

              {progressPct !== null && (
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.35, duration: 0.4 }}
                  className="w-full max-w-md flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between text-xs font-semibold text-gray-700">
                    <span>Progress</span>
                    <span className="tabular-nums">
                      {achievement.progress!.current} / {achievement.progress!.target}
                    </span>
                  </div>
                  <div className="h-3 w-full bg-white border border-black rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPct}%` }}
                      transition={{ delay: 0.45, duration: 0.6 }}
                      className="h-full bg-primary"
                    />
                  </div>
                </motion.div>
              )}
            </Modal.Body>

            {/* Sticky share footer */}
            <div className="sticky bottom-0 px-5 sm:px-10 pt-3 pb-6 bg-background border-t border-black/10">
              <button
                type="button"
                onClick={handleShare}
                className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-md bg-primary hover:bg-primary/80 text-black border border-black border-b-3 text-sm font-bold uppercase tracking-wide transition shadow-sm hover:-translate-y-0.5"
              >
                <FiShare2 className="h-4 w-4" />
                Share
              </button>
            </div>
          </motion.div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
