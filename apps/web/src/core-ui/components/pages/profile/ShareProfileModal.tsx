'use client';

import { Modal, toast } from '@heroui/react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import React, { useMemo } from 'react';
import { FiCopy, FiShare2, FiX } from 'react-icons/fi';

interface ShareProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  displayName: string;
  handle: string;
  /** The URL the QR code should encode. Defaults to the current window URL. */
  profileUrl?: string;
  /** Avatar image src. Defaults to the vaquita isotipo. */
  avatarSrc?: string;
}

const DEFAULT_AVATAR = '/vaquita/vaquita_isotipo.svg';

/**
 * Generates a QR for `data` via a public API. We use an `<img>` (not next/image)
 * to avoid wiring a remote-image domain to next.config — this is a small,
 * scan-on-screen asset.
 */
const buildQrSrc = (data: string, size = 480) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=4&qzone=2&color=262626&bgcolor=FFFFFF&data=${encodeURIComponent(
    data
  )}`;

export function ShareProfileModal({
  open,
  onOpenChange,
  displayName,
  handle,
  profileUrl,
  avatarSrc = DEFAULT_AVATAR,
}: ShareProfileModalProps) {
  const url = useMemo(() => {
    if (profileUrl) return profileUrl;
    if (typeof window !== 'undefined') return window.location.href;
    return 'https://vaquita.finance';
  }, [profileUrl]);

  const qrSrc = useMemo(() => buildQrSrc(url), [url]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Profile link copied');
    } catch (error) {
      const message = (error as { message?: string })?.message ?? '';
      toast.danger('Could not copy link', { description: message });
    }
  };

  const handleNativeShare = async () => {
    try {
      if (typeof navigator !== 'undefined' && (navigator as Navigator & { share?: unknown }).share) {
        await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
          title: `${displayName} on Vaquita`,
          text: `Follow ${displayName} on Vaquita 🐮`,
          url,
        });
        return;
      }
      await handleCopy();
    } catch (error) {
      const message = (error as { message?: string })?.message ?? '';
      if (message && !message.toLowerCase().includes('abort')) {
        toast.danger('Could not share', { description: message });
      }
    }
  };

  return (
    <Modal.Backdrop
      isOpen={open}
      isDismissable
      onOpenChange={(o) => {
        if (!o) onOpenChange(false);
      }}
      className="bg-black/70 backdrop-blur-sm data-[exiting=true]:duration-300"
    >
      <Modal.Container size="sm" placement="center" className="p-4!">
        <Modal.Dialog className="bg-background border border-black border-b-2 rounded-3xl p-0! max-w-sm w-full data-[exiting=true]:duration-300">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            className="flex flex-col items-center p-6 pb-7 gap-5"
          >
            {/* Close */}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
              className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white border border-black border-b-2 text-black hover:bg-white/80 transition"
            >
              <FiX className="h-4 w-4" />
            </button>

            {/* Avatar + identity */}
            <div className="flex flex-col items-center gap-1.5 pt-2">
              <div className="h-16 w-16 rounded-full bg-white border-2 border-black border-b-4 flex items-center justify-center overflow-hidden shadow">
                <Image src={avatarSrc} alt={displayName} width={56} height={56} className="object-contain" />
              </div>
              <h2 className="text-xl font-extrabold text-black tracking-tight text-center">
                {displayName}
              </h2>
              <p className="text-xs font-semibold text-gray-500 tabular-nums">{handle}</p>
            </div>

            {/* QR */}
            <div className="rounded-2xl bg-white border-2 border-black border-b-4 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrSrc}
                alt={`QR code for ${handle}`}
                width={240}
                height={240}
                className="block rounded-md"
              />
            </div>

            <p className="text-center text-xs text-gray-600 max-w-[16rem] leading-relaxed">
              Have a friend scan this QR to follow you on Vaquita.
            </p>

            {/* Actions */}
            <div className="flex flex-col gap-2 w-full pt-1">
              <button
                type="button"
                onClick={handleNativeShare}
                className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-md bg-primary hover:bg-primary/80 text-black border border-black border-b-3 text-xs font-extrabold uppercase tracking-wider transition shadow-sm hover:-translate-y-0.5"
              >
                <FiShare2 className="h-4 w-4" />
                Share link
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-md bg-white hover:bg-white/80 text-black border border-black border-b-3 text-xs font-extrabold uppercase tracking-wider transition shadow-sm hover:-translate-y-0.5"
              >
                <FiCopy className="h-4 w-4" />
                Copy link
              </button>
            </div>
          </motion.div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
