'use client';

import { Modal, ModalBody, ModalContent, Spinner } from '@heroui/react';
import Image from 'next/image';
import { useDeposit } from '../../../hooks';
import { VaquitaModalProps } from './types';
import { VaquitaModalContent } from './VaquitaModalContent';

export const VaquitaModal = ({ isOpen, onClose, vaquitaSummary, isLeaderboard }: VaquitaModalProps) => {
  const { isLoading, data: vaquita = null } = useDeposit(vaquitaSummary.id);

  if (isLoading || !vaquita) {
    return (
      <Modal
        isOpen={isOpen}
        onOpenChange={(open) => !open && onClose()}
        closeButton={
          <Image src="/icons/close-circle.svg" alt="close" width={40} height={40} className="sm:w-10 sm:h-10" />
        }
        size={'sm'}
        classNames={{
          base: 'bg-background text-[#191001] m-0 sm:m-4 border-1 border-black',
        }}
        scrollBehavior="inside"
      >
        <ModalContent>
          <ModalBody>
            <div className="flex justify-center items-center py-8">
              <Spinner size="lg" color="primary" />
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>
    );
  }

  return <VaquitaModalContent isOpen={isOpen} onClose={onClose} vaquita={vaquita} isLeaderboard={isLeaderboard} />;
};
