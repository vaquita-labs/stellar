import {
  Avatar,
  Badge,
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Tooltip,
} from '@heroui/react';
import Image from 'next/image';
import { Dispatch, ReactNode, SetStateAction, useEffect, useMemo, useState } from 'react';
import { FiCheck, FiCopy, FiEdit3, FiLogOut, FiSave, FiUserPlus } from 'react-icons/fi';
import { truncateMiddle } from '../../../helpers';
import { useNetworkConfigStore } from '../../../stores';
import { useProfileData, useRestProfile } from '@/core-ui/hooks';

interface ProfileModalProps {
  handleLogout?: () => void;
  isOpen: boolean;
  onOpenChange: Dispatch<SetStateAction<boolean>>;
  walletAddress: string;
}

const LogoByType: Record<string, ReactNode> = {
  EVM: <Image src="/chains/base_400x400.jpg" alt="EVM" width={24} height={24} className="rounded-sm" />,
  Stellar: <Image src="/chains/stellar.png" alt="Stellar" width={24} height={24} className="rounded-sm" />,
};

export const ProfileModal = ({ handleLogout, isOpen, onOpenChange, walletAddress }: ProfileModalProps) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState(false);
  const { network } = useNetworkConfigStore();
  const { data, isLoading, refetch } = useProfileData();
  const { saveNickname } = useRestProfile();
  const currentNickname = data?.nickname ?? '';
  const trimmedNickname = useMemo(() => nickname.trim(), [nickname]);
  const displayName = useMemo(() => {
    if (isLoading) return 'Cargando...';
    if (trimmedNickname) return `@${trimmedNickname}`;
    if (currentNickname) return `@${currentNickname}`;
    return truncateMiddle(walletAddress) || 'Vaquita';
  }, [currentNickname, isLoading, trimmedNickname, walletAddress]);
  const walletDisplay = useMemo(() => truncateMiddle(walletAddress), [walletAddress]);
  const isDirty = trimmedNickname !== currentNickname && !!trimmedNickname;
  const canSave = !!walletAddress && !!network?.name && isDirty && !saving;

  useEffect(() => {
    if (!isEditing) {
      setNickname(currentNickname);
    }
  }, [currentNickname, isEditing]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Error al copiar: ', err);
    }
  };

  const handleStartEditing = () => {
    setNickname(currentNickname);
    setIsEditing(true);
  };

  const handleCancelEditing = () => {
    setNickname(currentNickname);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!canSave || !network?.name) return;
    setSaving(true);
    try {
      await saveNickname(network.name, walletAddress, { nickname: trimmedNickname });
      await refetch();
      setIsEditing(false);
    } catch (error) {
      console.error('Error al guardar el perfil:', error);
    } finally {
      setSaving(false);
    }
  };

  const badgeLogo = network?.type ? (LogoByType[network.type] ?? LogoByType.EVM) : LogoByType.EVM;

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="sm"
      closeButton={<Image src="/icons/close-circle.svg" alt="close" width={40} height={40} />}
      onClose={() => handleCancelEditing()}
    >
      <ModalContent className="bg-background border border-black">
        <ModalHeader className="text-black font-bold text-lg">Profile</ModalHeader>
        <ModalBody>
          <div className="flex flex-col items-center gap-2 ">
            <Badge placement="bottom-right" isOneChar content={badgeLogo}>
              <Avatar
                size="lg"
                src="/vaquita_working.jpg"
                name={displayName}
                className="border-2 border-white shadow-lg dark:border-default-100"
              />
            </Badge>

            <p className="text-md font-semibold text-gray-900 dark:text-gray-50">{displayName}</p>

            {!isEditing && walletAddress && (
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <span>{walletDisplay}</span>
                <Tooltip content={copied ? 'Copiado' : 'Copiar dirección'}>
                  <button
                    onClick={() => copyToClipboard(walletAddress)}
                    className="rounded-full border border-default-200 p-2 transition hover:-translate-y-0.5 hover:bg-gray-100 dark:border-default-100 dark:hover:bg-default-100"
                    aria-label="Copiar dirección de la wallet"
                  >
                    {copied ? <FiCheck className="h-4 w-4 text-emerald-500" /> : <FiCopy className="h-4 w-4" />}
                  </button>
                </Tooltip>
              </div>
            )}
          </div>
          {isEditing ? (
            <div className="gap-2 flex flex-col">
              <Input
                type="text"
                label="Nickname"
                placeholder="@nickname"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                maxLength={32}
                isDisabled={saving}
                classNames={{
                  inputWrapper: 'bg-white border border-black border-b-2 h-14',
                  label: 'text-black font-normal text-sm',
                  input: 'text-black font-medium',
                }}
              />
              <Input
                type="text"
                label="Wallet"
                value={walletDisplay}
                isDisabled
                classNames={{
                  inputWrapper: 'bg-white border border-black border-b-2 h-14',
                  label: 'text-black font-normal text-sm',
                  input: 'text-black font-medium',
                }}
              />
            </div>
          ) : (
            <div className="flex w-full flex-row gap-3 md:flex-row md:justify-center">
              <Badge placement="bottom-left" color="warning" content={<span className="text-xs px-1">Soon</span>}>
                <Button
                  variant="flat"
                  className="w-full rounded-lg bg-primary px-5 text-sm  text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 md:w-auto dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                  startContent={<FiUserPlus />}
                  onPress={() => console.info('Friends feature coming soon')}
                >
                  Add friends
                </Button>
              </Badge>
              <Button
                variant="flat"
                startContent={<FiEdit3 />}
                className="w-full rounded-lg bg-black px-5 text-sm  text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 md:w-auto dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                onPress={handleStartEditing}
                isDisabled={isLoading}
              >
                Edit profile
              </Button>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          {isEditing && (
            <div className="flex gap-2">
              <button
                onClick={handleCancelEditing}
                disabled={saving}
                className="px-4 py-2 rounded-md bg-gray-200 text-black text-sm font-semibold hover:bg-gray-300 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
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
            </div> 
          )}
          {handleLogout && !isEditing && (
            <Button
              variant="flat"
              color="danger"
              startContent={<FiLogOut className="h-4 w-4" />}
              onPress={handleLogout}
              className="w-full max-w-sm rounded-xl border border-red-200/70 bg-red-50 text-sm font-semibold text-red-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
            >
              Disconnect wallet
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
