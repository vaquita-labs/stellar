'use client';

import { Modal, toast } from '@heroui/react';
import Image from 'next/image';
import React, { useEffect, useState } from 'react';
import { FiSave } from 'react-icons/fi';
import { truncateMiddle } from '../../helpers';
import { useRestProfile } from '../../hooks';
import { useNetworkConfigStore } from '../../stores';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentNickname: string;
}

export function EditProfileModal({ isOpen, onClose, currentNickname }: EditProfileModalProps) {
  const { network, walletAddress } = useNetworkConfigStore();
  const { saveNickname } = useRestProfile();
  const [nickname, setNickname] = useState<string>(currentNickname);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNickname(currentNickname);
    setSaving(false);
  }, [currentNickname, isOpen]);

  const displayName = nickname.trim() ? nickname.trim() : truncateMiddle(walletAddress) || 'Guest';
  const isDirty = nickname.trim() !== currentNickname;
  const canSave = !!walletAddress && isDirty && !saving && !!network;

  const handleSubmit = async () => {
    if (canSave) {
      setSaving(true);
      try {
        const { success, message } = await saveNickname({ nickname });
        if (success) {
          toast.success('Nickname saved', { timeout: 4000 });
          onClose();
        } else {
          toast.danger('Error on saving nickname', { description: message, timeout: 4000 });
        }
      } catch (error) {
        toast.danger('Error on saving nickname', { description: (error as { message: string })?.message ?? '', timeout: 4000 });
      }
      setSaving(false);
    }
  };

  const handleClose = () => {
    setNickname(currentNickname);
    onClose();
  };

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <Modal.Container size="sm">
        <Modal.Dialog className="bg-background border border-black">
          <Modal.CloseTrigger>
            <Image src="/icons/close-circle.svg" alt="close" width={40} height={40} />
          </Modal.CloseTrigger>
          <Modal.Header>
            <Modal.Heading className="text-black font-bold text-lg">Edit Profile</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
          <div className="space-y-4">
            <div>
              <label className="text-black font-normal text-sm block mb-1">Nickname</label>
              <input
                type="text"
                placeholder="@nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={32}
                disabled={!walletAddress}
                className="w-full bg-white border border-black border-b-2 h-14 px-3 text-black font-medium rounded-sm outline-none disabled:opacity-50"
              />
              <p className="text-xs pl-2 text-gray-600 mt-1">Shown as: @{displayName}</p>
            </div>
            <div>
              <label className="text-black font-normal text-sm block mb-1">Wallet</label>
              <input
                type="text"
                value={truncateMiddle(walletAddress)}
                readOnly
                disabled
                className="w-full bg-white border border-black border-b-2 h-14 px-3 text-black font-medium rounded-sm outline-none opacity-50 cursor-not-allowed"
              />
            </div>
          </div>
          </Modal.Body>
          <Modal.Footer>
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
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
