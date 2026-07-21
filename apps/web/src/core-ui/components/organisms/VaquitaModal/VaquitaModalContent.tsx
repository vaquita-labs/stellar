'use client';

import { AppModal } from '../../molecules/AppModal';
import { VaquitaModalContentProps } from './types';
import { useVaquitaDetail } from './useVaquitaDetail';

export const VaquitaModalContent = ({
  isOpen,
  onClose,
  vaquita,
  isLeaderboard,
  simulate = false,
  simulateInterest = 0,
  onSimulatedWithdraw,
}: VaquitaModalContentProps) => {
  const { title, body, footer, loading, ready } = useVaquitaDetail({
    vaquita,
    onClose,
    isLeaderboard,
    simulate,
    simulateInterest,
    onSimulatedWithdraw,
  });

  if (!ready) return null;

  return (
    <AppModal
      open={isOpen}
      onOpenChange={loading ? () => {} : onClose}
      isDismissable={!loading}
      title={title}
      titleIconAlt="vaquita"
      size="sm"
      bodyClassName="flex flex-col gap-5 pb-6"
      footer={footer}
    >
      {body}
    </AppModal>
  );
};
