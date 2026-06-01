'use client';

import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Select, SelectItem } from '@heroui/react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { formatTimeDeposit } from '../../../helpers';
import { useNetworkConfigStore } from '../../../stores';
import { T } from '../../atoms/T';
import { LockPeriodModalProps } from './types';

export function LockPeriodModal({ open, onOpenChange }: LockPeriodModalProps) {
  const { token, lockPeriod, setLockPeriod } = useNetworkConfigStore();
  const lockTimeOptions =
    token?.lockPeriod.map((lockPeriod) => ({
      key: lockPeriod,
      label: formatTimeDeposit(lockPeriod),
      available: lockPeriod < 0 ? false : true,
    })) ?? [];

  const [selectedLockTime, setSelectedLockTime] = useState<string | null>(null);

  useEffect(() => {
    if (lockPeriod !== null) {
      setSelectedLockTime(lockPeriod.toString());
    }
  }, [lockPeriod]);

  useEffect(() => {
    setSelectedLockTime(null);
  }, [token?.symbol]);

  const handleConfirm = () => {
    if (selectedLockTime) {
      setLockPeriod(parseInt(selectedLockTime));
      onOpenChange();
    }
  };

  const isDisabled = !selectedLockTime;

  return (
    <Modal
      size="md"
      isOpen={open}
      onOpenChange={onOpenChange}
      closeButton={<Image src="/icons/close-circle.svg" alt="close" width={40} height={40} />}
      scrollBehavior="inside"
      classNames={{
        base: 'max-h-[90vh]',
        body: 'overflow-y-auto',
      }}
    >
      <ModalContent className="bg-background border border-black">
        <ModalHeader className="text-black font-bold text-xl">
          <T>Select Lock Period</T>
        </ModalHeader>
        <ModalBody className="py-0 max-h-[60vh] overflow-y-auto">
          <div>
            <Select
              label={<T>Lock time</T>}
              isRequired
              selectedKeys={selectedLockTime ? [selectedLockTime] : []}
              onSelectionChange={(keys) => {
                const selectedKey = Array.from(keys)[0] as string;
                if (selectedKey) setSelectedLockTime(selectedKey);
              }}
              classNames={{
                trigger: 'bg-white border border-black border-b-2 h-14',
                label: 'text-black font-normal text-sm',
                value: 'text-black font-medium',
                popoverContent: 'bg-white border border-black rounded-md shadow-lg',
                selectorIcon: 'text-black ',
              }}
              description={<T>The funds will be held in escrow during the selected period.</T>}
            >
              {lockTimeOptions?.map((option) => (
                <SelectItem key={option.key} textValue={option.label} isDisabled={!option.available}>
                  <div className="flex justify-between items-center w-full">
                    <div className="flex flex-col">
                      <span className="font-semibold text-black">{option.label}</span>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </Select>
          </div>
        </ModalBody>

        <ModalFooter>
          <Button
            onPress={handleConfirm}
            className="w-full border px-4 py-6 bg-success border-[#018222] border-b-5 font-bold rounded-md"
            isDisabled={isDisabled}
          >
            <T>Confirm</T>
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
