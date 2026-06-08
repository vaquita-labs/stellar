import { useProfileData, useRestProfile } from '@/core-ui/hooks';
import { Avatar, Modal, Tooltip } from '@heroui/react';
import Image from 'next/image';
import { Dispatch, ReactNode, SetStateAction, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheck, FiCopy, FiEdit3, FiLogOut, FiSave, FiUserPlus } from 'react-icons/fi';
import { truncateMiddle } from '../../../helpers';
import { useConfigStore } from '../../../stores';
import { Button } from '../../atoms';
import { Badge } from '../../Badge';

interface ProfileModalProps {
  handleLogout?: () => void;
  isOpen: boolean;
  onOpenChange: Dispatch<SetStateAction<boolean>>;
  walletAddress: string;
}

const LogoByType: Record<string, ReactNode> = {
  Stellar: <Image src="/chains/stellar.png" alt="Stellar" width={24} height={24} className="rounded-sm" />,
};

export const ProfileModal = ({ handleLogout, isOpen, onOpenChange, walletAddress }: ProfileModalProps) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState(false);
  const { network } = useConfigStore();
  const { data, isLoading, refetch } = useProfileData();
  const { saveNickname } = useRestProfile();
  const currentNickname = data?.nickname ?? '';
  const trimmedNickname = useMemo(() => nickname.trim(), [nickname]);
  const displayName = useMemo(() => {
    if (isLoading) return t('common.loading');
    if (trimmedNickname) return `@${trimmedNickname}`;
    if (currentNickname) return `@${currentNickname}`;
    return truncateMiddle(walletAddress) || 'Vaquita';
  }, [currentNickname, isLoading, trimmedNickname, walletAddress, t]);
  const walletDisplay = useMemo(() => truncateMiddle(walletAddress), [walletAddress]);
  const isDirty = trimmedNickname !== currentNickname && !!trimmedNickname;
  const canSave = !!walletAddress && !!network?.networkName && isDirty && !saving;

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
    if (!canSave || !network?.networkName) return;
    setSaving(true);
    try {
      await saveNickname({ nickname: trimmedNickname });
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
    <Modal.Backdrop
      isOpen={isOpen}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) handleCancelEditing();
      }}
    >
      <Modal.Container size="sm">
        <Modal.Dialog className="bg-background border border-black">
          <Modal.CloseTrigger>
            <Image src="/icons/close-circle.svg" alt={t('common.close')} width={40} height={40} />
          </Modal.CloseTrigger>
          <Modal.Header>
            <Modal.Heading className="text-black font-bold text-lg">{t('wallet.profile.title')}</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
          <div className="flex flex-col items-center gap-2 ">
            <Badge placement="bottom-right" isOneChar content={badgeLogo}>
              <Avatar
                size="lg"
                className="border-2 border-white shadow-lg dark:border-default-100"
              >
                <Avatar.Image src="/vaquita_working.jpg" />
                <Avatar.Fallback>{displayName.slice(0, 2).toUpperCase()}</Avatar.Fallback>
              </Avatar>
            </Badge>

            <p className="text-md font-semibold text-gray-900 dark:text-gray-50">{displayName}</p>

            {!isEditing && walletAddress && (
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <span>{walletDisplay}</span>
                <Tooltip>
                  <Tooltip.Trigger>
                    <button
                      onClick={() => copyToClipboard(walletAddress)}
                      className="rounded-full border border-default-200 p-2 transition hover:-translate-y-0.5 hover:bg-gray-100 dark:border-default-100 dark:hover:bg-default-100"
                      aria-label={t('wallet.profile.copyAddressAria')}
                    >
                      {copied ? <FiCheck className="h-4 w-4 text-emerald-500" /> : <FiCopy className="h-4 w-4" />}
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Content>
                    {copied ? t('wallet.profile.copied') : t('wallet.profile.copyAddress')}
                  </Tooltip.Content>
                </Tooltip>
              </div>
            )}
          </div>
          {isEditing ? (
            <div className="gap-2 flex flex-col">
              <div>
                <label className="text-black font-normal text-sm block mb-1">{t('wallet.profile.nicknameLabel')}</label>
                <input
                  type="text"
                  placeholder="@nickname"
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  maxLength={32}
                  disabled={saving}
                  className="w-full bg-white border border-black border-b-2 h-14 px-3 text-black font-medium rounded-sm outline-none disabled:opacity-50"
                />
              </div>
              <div>
                <label className="text-black font-normal text-sm block mb-1">{t('wallet.profile.walletLabel')}</label>
                <input
                  type="text"
                  value={walletDisplay}
                  readOnly
                  disabled
                  className="w-full bg-white border border-black border-b-2 h-14 px-3 text-black font-medium rounded-sm outline-none opacity-50 cursor-not-allowed"
                />
              </div>
            </div>
          ) : (
            <div className="flex w-full flex-row gap-3 md:flex-row md:justify-center">
              <Badge content={t('common.soon')}>
                <Button startContent={<FiUserPlus />} isDisabled>
                  {t('wallet.profile.addFriends')}
                </Button>
              </Badge>
              <Button startContent={<FiEdit3 />} type="secondary" onPress={handleStartEditing} isDisabled={isLoading}>
                {t('wallet.profile.editProfile')}
              </Button>
            </div>
          )}
          </Modal.Body>
          <Modal.Footer>
          {isEditing && (
            <div className="flex gap-2">
              <button
                onClick={handleCancelEditing}
                disabled={saving}
                className="px-4 py-2 rounded-md bg-gray-200 text-black text-sm font-semibold hover:bg-gray-300 transition disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={!canSave}
                className="px-4 py-2 rounded-md bg-primary text-black text-sm font-semibold hover:bg-[#e68a00] transition disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                    {t('common.saving')}
                  </>
                ) : (
                  <>
                    <FiSave className="w-4 h-4" />
                    {t('wallet.profile.saveChanges')}
                  </>
                )}
              </button>
            </div>
          )}
          {handleLogout && !isEditing && (
            <Button type="danger" startContent={<FiLogOut className="h-4 w-4" />} onPress={handleLogout} wFull>
              {t('wallet.profile.disconnectWallet')}
            </Button>
          )}
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
};
