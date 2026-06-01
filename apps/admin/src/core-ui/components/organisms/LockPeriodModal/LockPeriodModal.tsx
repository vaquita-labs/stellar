'use client';

import { Button, Description, Label, ListBox, Modal, Select } from '@heroui/react';
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
    <Modal.Backdrop isOpen={open} onOpenChange={(o) => { if (!o) onOpenChange(); }}>
      <Modal.Container size="md" scroll="inside">
        <Modal.Dialog className="bg-background border border-black max-h-[90vh]">
          <Modal.CloseTrigger>
            <Image src="/icons/close-circle.svg" alt="close" width={40} height={40} />
          </Modal.CloseTrigger>
          <Modal.Header>
            <Modal.Heading className="text-black font-bold text-xl">
              <T>Select Lock Period</T>
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="py-0 max-h-[60vh] overflow-y-auto">
            <div>
              <Select
                isRequired
                value={selectedLockTime ?? ''}
                onChange={(value) => { if (value) setSelectedLockTime(value as string); }}
                disabledKeys={lockTimeOptions.filter((o) => !o.available).map((o) => o.key.toString())}
              >
                <Label className="text-black font-normal text-sm"><T>Lock time</T></Label>
                <Select.Trigger className="bg-white border border-black border-b-2 h-14">
                  <Select.Value className="text-black font-medium" />
                  <Select.Indicator className="text-black" />
                </Select.Trigger>
                <Select.Popover className="bg-white border border-black rounded-md shadow-lg">
                  <ListBox>
                    {lockTimeOptions?.map((option) => (
                      <ListBox.Item key={option.key.toString()} id={option.key.toString()} textValue={option.label}>
                        <span className="font-semibold text-black">{option.label}</span>
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
                <Description><T>The funds will be held in escrow during the selected period.</T></Description>
              </Select>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button
              onPress={handleConfirm}
              className="w-full border px-4 py-6 bg-success border-[#018222] border-b-5 font-bold rounded-md"
              isDisabled={isDisabled}
            >
              <T>Confirm</T>
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
