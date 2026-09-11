'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '@heroui/react';
import { saveAffordanceFor, type SaveAffordance } from '@/networks/pollar/onrampPayment';
import { renderQrPngFile, saveQrImage } from '@/networks/pollar/qrImage';
import { AppModal } from '../../molecules/AppModal';
import { PressableButton } from '../../molecules/PressableButton';

interface InviteQrModalProps {
  open: boolean;
  onClose: () => void;
  /** The vaquitatag, printed under the code so it can be typed instead of scanned. */
  tag: string;
  /** What the code encodes. Already stamped with `utm_source=qr`. */
  url: string;
}

/**
 * The invite code as something a phone camera can read.
 *
 * This is the in-person half of the invite screen: at an event the link cannot
 * be sent anywhere, so the screen itself is the medium. The code is drawn big
 * and on a fixed white background — it is read across a table, and from a
 * gallery afterwards, where no dark theme exists to compensate.
 *
 * The tag is printed underneath on purpose. A camera that will not focus, a
 * cracked screen or plain distance all end the same way, and a tag someone can
 * type from memory is the fallback the QR does not have.
 *
 * Rendering is the same canvas path the on-ramp uses: a real PNG, not an SVG,
 * because iOS refuses to put an SVG in Photos and the code is worth keeping.
 */
export function InviteQrModal({ open, onClose, tag, url }: InviteQrModalProps) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Measured once, on mount: `matchMedia` and `navigator` do not exist in the
  // server render. On desktop nothing is offered — the code is scanned off the
  // screen there, and a download would only leave a stray PNG behind.
  const affordance: SaveAffordance = useMemo(() => {
    if (typeof window === 'undefined') return 'none';
    const probe = new File([new Blob([''])], 'qr.png', { type: 'image/png' });
    return saveAffordanceFor({
      coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
      canDownload: typeof URL.createObjectURL === 'function' && 'download' in document.createElement('a'),
      canShareFiles: navigator.canShare?.({ files: [probe] }) ?? false,
    });
  }, []);

  // Rasterising goes through a canvas, so it happens once per payload and the
  // File is kept: it is the very same one the save button hands the device.
  //
  // Keyed on the payload and not on `open`: the code is drawn as soon as the
  // invite screen has a tag, so the modal opens with it already there. Tying it
  // to `open` would redraw on every open and, worse, revoke the object URL on
  // every close — leaving the second open pointed at a blob that no longer
  // exists.
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const rendered = await renderQrPngFile(url, `vaquita-${tag || 'invite'}.png`);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(rendered);
        setFile(rendered);
        setSrc(objectUrl);
      } catch {
        // No canvas, no code. The tag below is still readable, which is the
        // whole reason it is printed there.
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, tag]);

  // "Saved" is about the last tap, not about the code: it goes away with the
  // sheet so the next open does not claim a save that has not happened yet.
  const handleClose = () => {
    setSaved(false);
    onClose();
  };

  const handleSave = async () => {
    if (!file) return;
    setSaving(true);
    try {
      const outcome = await saveQrImage(file);
      setSaved(outcome !== 'manual');
    } catch {
      // The share-sheet fallback can be dismissed without picking anything.
      // That is a decision, not an error worth reporting.
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal open={open} onOpenChange={handleClose} title={t('referrals.qr.title', 'Your invite QR')} size="sm">
      <div className="flex flex-col items-center gap-4 pb-2">
        <p className="text-center text-xs text-gray-500">
          {t('referrals.qr.hint', 'Have them scan this with the phone camera. It opens Vaquita with your tag already applied.')}
        </p>

        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={t('referrals.qr.alt', 'QR code with your invite link')}
            className="h-64 w-64 rounded-lg border border-black border-b-2 bg-white object-contain p-2"
          />
        ) : failed ? (
          <div className="flex h-64 w-64 items-center justify-center rounded-lg border border-black border-b-2 bg-white p-4 text-center">
            <p className="text-xs text-gray-500">
              {t('referrals.qr.unavailable', 'We could not draw the code here. Share your link instead.')}
            </p>
          </div>
        ) : (
          <div className="flex h-64 w-64 items-center justify-center rounded-lg border border-black border-b-2 bg-white">
            <Spinner size="sm" color="current" />
          </div>
        )}

        <p className="font-mono text-lg font-bold tracking-wide text-black">@{tag}</p>

        {affordance === 'save' && file && (
          <PressableButton variant="success" size="cta" onClick={() => void handleSave()} disabled={saving}>
            {saved ? t('referrals.qr.saved', 'Saved') : t('referrals.qr.save', 'Save the QR to my phone')}
          </PressableButton>
        )}
        {affordance === 'longPress' && (
          <p className="text-center text-[11px] text-gray-400">
            {t('referrals.qr.longPress', 'Press and hold the code to save it to your photos.')}
          </p>
        )}
      </div>
    </AppModal>
  );
}
