'use client';

import { truncateMiddle } from '@/core-ui/helpers';
import { useRestProfile } from '@/core-ui/hooks';
import { useNetworkConfigStore } from '@/core-ui/stores';
import { Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import Image from 'next/image';
import React, { useEffect, useState } from 'react';
import { FiSave } from 'react-icons/fi';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentNickname: string;
  onSuccess: (nickname: string) => void;
}

export function EditProfileModal({ isOpen, onClose, currentNickname, onSuccess }: EditProfileModalProps) {
  const { network, walletAddress } = useNetworkConfigStore();
  const { saveNickname } = useRestProfile();
  const [nickname, setNickname] = useState<string>(currentNickname);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNickname(currentNickname);
  }, [currentNickname]);

  const displayName = nickname.trim() ? nickname.trim() : truncateMiddle(walletAddress) || 'Guest';
  const isDirty = nickname.trim() !== currentNickname;
  const canSave = !!walletAddress && isDirty && !saving && !!network;

  const handleSubmit = async () => {
    if (canSave) {
      setSaving(true);
      try {
        await saveNickname(network?.name, walletAddress, { nickname });
        onSuccess(nickname);
        onClose();
      } finally {
        setSaving(false);
      }
    }
  };

  const handleClose = () => {
    setNickname(currentNickname);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={handleClose}
      size={'sm'}
      closeButton={<Image src="/icons/close-circle.svg" alt="close" width={40} height={40} />}
      scrollBehavior="inside"
    >
      <ModalContent className="bg-background border border-black">
        <ModalHeader className="text-black font-bold text-lg">Edit Profile</ModalHeader>
        <ModalBody>
          <div className="space-y-4">
            <div>
              <Input
                type="text"
                label={'Nickname'}
                placeholder="@nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={32}
                disabled={!walletAddress}
                classNames={{
                  inputWrapper: 'bg-white border border-black border-b-2 h-14',
                  label: 'text-black font-normal text-sm',
                  input: 'text-black font-medium',
                }}
              />
              <p className="text-xs pl-2 text-gray-600 mt-1">Shown as: @{displayName}</p>
            </div>
            <div>
              <Input
                classNames={{
                  inputWrapper: 'bg-white border border-black border-b-2 h-14',
                  label: 'text-black font-normal text-sm',
                  input: 'text-black font-medium',
                }}
                type="text"
                label={'Wallet'}
                value={truncateMiddle(walletAddress)}
                readOnly
                isDisabled
              />
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <button
            onClick={handleClose}
            disabled={saving}
            className="px-4 py-2 rounded-md bg-gray-200 text-black text-sm font-semibold hover:bg-gray-300 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSave}
            className="px-4 py-2 rounded-md bg-primary text-black text-sm font-semibold hover:bg-[#e68a00] transition disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                Saving...
              </>
            ) : (
              <>
                <FiSave className="w-4 h-4" />
                Save changes
              </>
            )}
          </button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
