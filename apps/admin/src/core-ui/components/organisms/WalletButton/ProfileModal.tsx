import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import Image from 'next/image';
import { Dispatch, ReactNode, SetStateAction, useState } from 'react';
import { FiCheck, FiCopy } from 'react-icons/fi';
import { truncateMiddle } from '../../../helpers';
import { useNetworkConfigStore } from '../../../stores';
import { T } from '../../atoms';

interface ProfileModalProps {
  handleLogout?: () => void;
  isOpen: boolean;
  onOpenChange: Dispatch<SetStateAction<boolean>>;
  walletAddress: string;
}

const LogoByType: { [key: string]: ReactNode } = {
  EVM: <Image src="/chains/evm.png" alt="EVM" width={24} height={24} className="rounded-sm" />,
  Stellar: (
    <Image src="/chains/stellar.png" alt="Stellar" width={24} height={24} className="rounded-sm" />
  ),
};

export const ProfileModal = ({
  handleLogout,
  isOpen,
  onOpenChange,
  walletAddress,
}: ProfileModalProps) => {
  const [copied, setCopied] = useState(false);
  const { network } = useNetworkConfigStore();
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Error al copiar: ', err);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="sm"
      closeButton={<Image src="/icons/close-circle.svg" alt="close" width={40} height={40} />}
    >
      <ModalContent className="bg-background border border-black">
        <ModalHeader className="text-black font-bold text-lg">Disconnect Wallet</ModalHeader>
        <ModalBody>
          <p className="text-black">
            Are you sure you want to disconnect your {network?.type} wallet?
          </p>
          <div className="flex items-center gap-2 justify-center">
            {network?.type && LogoByType[network?.type]}
            <span className="text-xs font-mono text-gray-700 bg-gray-200 px-2 py-1 rounded">
              {truncateMiddle(walletAddress)}
            </span>
            <button
              onClick={() => copyToClipboard(walletAddress)}
              className="p-1 hover:bg-yellow-100 rounded transition-colors"
              title={copied ? 'Copied!' : 'Copy address'}
            >
              {copied ? (
                <FiCheck className="h-3 w-3 text-green-600" />
              ) : (
                <FiCopy className="h-3 w-3 text-gray-500" />
              )}
            </button>
          </div>
        </ModalBody>
        <ModalFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 rounded-md bg-gray-200 text-black text-sm font-semibold hover:bg-gray-300 transition"
          >
            <T>Cancel</T>
          </button>
          {handleLogout && (
            <button
              onClick={handleLogout}
              className="px-4 py-2 rounded-md bg-primary text-black text-sm font-semibold hover:bg-primary/80 transition"
            >
              <T>Disconnect</T>
            </button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
