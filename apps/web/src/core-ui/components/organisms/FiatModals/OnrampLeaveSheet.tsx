'use client';

import { Spinner } from '@heroui/react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { PressableButton } from '../../molecules/PressableButton';

interface OnrampLeaveSheetProps {
  show: boolean;
  /** The server is closing the purchase right now. */
  busy: boolean;
  /** What went wrong closing it, when something did. */
  error: string | null;
  /** Leave with the code alive: the purchase is picked up again on the way back. */
  onClose: () => void;
  /** Back to the code, nothing touched. */
  onStay: () => void;
  /** Give up the code, with the purchase closed on the server. */
  onCancel: () => void;
}

/**
 * What the X asks while the payment code is live.
 *
 * Closing and cancelling are not the same thing and the difference costs real
 * money: a closed purchase is waiting when the user comes back, a cancelled one
 * is gone. And the code being on screen does not prove nobody paid it — someone
 * who paid from the bank and cancels here buys again and pays twice, in real
 * bolivianos. So the question has THREE ways out, and what the destructive one
 * confirms is the claim ("I did not pay it"), never the action.
 *
 * It is drawn over the whole dialog, not in the body: the user pressed the X at
 * the top, and an answer below the fold of a scrolled sheet is one they have to
 * go looking for.
 */
export function OnrampLeaveSheet({ show, busy, error, onClose, onStay, onCancel }: OnrampLeaveSheetProps) {
  const { t } = useTranslation();
  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div
            key="leave-dim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-10 bg-black/40"
            onClick={onStay}
          />
          <motion.div
            key="leave-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'tween', ease: [0.32, 0.72, 0, 1], duration: 0.25 }}
            className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 rounded-t-2xl border-t border-black bg-background px-4 pt-4 pb-5"
          >
            <p className="text-base font-bold text-black">
              {t('wallet.fiat.onramp.leaveTitle', 'Your payment code is still open')}
            </p>
            <p className="text-xs text-gray-600">
              {t(
                'wallet.fiat.onramp.leaveBody',
                'You can close this and come back whenever you want — the code will be waiting. If you already paid it, your USDC is on its way and it is only a matter of waiting a moment. Only cancel it if you have not paid yet.',
              )}
            </p>
            <PressableButton variant="success" size="md" fullWidth onClick={onClose} disabled={busy}>
              {t('wallet.fiat.onramp.leaveClose', 'Close and come back later')}
            </PressableButton>
            <PressableButton variant="white" size="md" fullWidth onClick={onStay} disabled={busy}>
              {t('wallet.fiat.onramp.leaveStay', 'Keep waiting here')}
            </PressableButton>
            <PressableButton variant="danger" size="md" fullWidth onClick={onCancel} disabled={busy}>
              {busy ? (
                <Spinner size="sm" color="current" />
              ) : (
                t('wallet.fiat.onramp.leaveCancel', 'I have not paid — cancel it')
              )}
            </PressableButton>
            {error && <p className="text-center text-xs font-medium text-red-600">{error}</p>}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
