'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BsQrCode } from 'react-icons/bs';
import { MdQrCode } from "react-icons/md";
import { ShareProfileModal } from './ShareProfileModal';

interface ShareProfileQrButtonProps {
  displayName: string;
  handle: string;
  /** Overrides the URL encoded into the QR. Defaults to the current window URL. */
  profileUrl?: string;
  /** Overrides the avatar shown above the QR. Defaults to the vaquita isotipo. */
  avatarSrc?: string;
  /** Replaces the pill's own sizing/shape classes (e.g. to match a taller CTA
   *  it sits next to). The default is the 36px circle used in page headers. */
  className?: string;
}

/**
 * Circular QR pill button that opens the `ShareProfileModal`. Shared between
 * the leaderboard header and the profile header so both surfaces stay visually
 * and functionally identical — same style, same icon, same modal flow.
 */
export function ShareProfileQrButton({
  displayName,
  handle,
  profileUrl,
  avatarSrc,
  className = 'h-9 w-9 rounded-full',
}: ShareProfileQrButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('social.share.qrButtonLabel')}
        className={`inline-flex shrink-0 items-center justify-center bg-white/70 border border-black border-b-2 text-black hover:bg-white transition ${className}`}
      >
        <MdQrCode className="h-5 w-5" />
      </button>

      <ShareProfileModal
        open={open}
        onOpenChange={setOpen}
        displayName={displayName}
        handle={handle}
        profileUrl={profileUrl}
        avatarSrc={avatarSrc}
      />
    </>
  );
}
