'use client';

import { Modal, Spinner } from '@heroui/react';
import Image from 'next/image';
import { useDeposit } from '../../../hooks';
import { VaquitaModalProps } from './types';
import { VaquitaModalContent } from './VaquitaModalContent';

export const VaquitaModal = ({ isOpen, onClose, vaquitaSummary, isLeaderboard }: VaquitaModalProps) => {
  const { isLoading, data: vaquita = null } = useDeposit(vaquitaSummary.id);

  if (isLoading || !vaquita) {
    return (
      <Modal.Backdrop isOpen={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <Modal.Container size="sm">
          <Modal.Dialog className="bg-background text-[#191001] border border-black">
            <Modal.CloseTrigger>
              <Image src="/icons/close-circle.svg" alt="close" width={40} height={40} className="sm:w-10 sm:h-10" />
            </Modal.CloseTrigger>
            <Modal.Body>
              <div className="flex justify-center items-center py-8">
                <Spinner size="lg" color="accent" />
              </div>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    );
  }

  return <VaquitaModalContent isOpen={isOpen} onClose={onClose} vaquita={vaquita} isLeaderboard={isLeaderboard} />;
};