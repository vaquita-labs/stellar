'use client';

import { Avatar, Spinner, Switch, toast } from '@heroui/react';
import { useRouter } from 'next/navigation';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FiCamera, FiSave, FiTrash2 } from 'react-icons/fi';
import { truncateMiddle } from '../../../helpers';
import { useProfileData, useRestProfile } from '../../../hooks';
import { useConfigStore } from '../../../stores';
import { Button } from '../../atoms';
import { PageLayout } from '../../molecules';

export function EditProfilePage() {
  const router = useRouter();
  const { walletAddress, network } = useConfigStore();
  const { data, isLoading, refetch } = useProfileData();
  const { saveNickname, saveProfileFlags } = useRestProfile();

  const initialNickname = (data?.nickname ?? '').trim();
  const profileEmail = (data?.email ?? '').trim();

  const DEFAULT_AVATAR = '/vaquita_working.jpg';

  const [nickname, setNickname] = useState<string>(initialNickname);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [tutorialCompleted, setTutorialCompleted] = useState(false);
  const [savingFlag, setSavingFlag] = useState<null | 'onboarding' | 'tutorial'>(null);
  const [saving, setSaving] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState<string>(DEFAULT_AVATAR);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    setNickname(initialNickname);
  }, [initialNickname]);

  useEffect(() => {
    setOnboardingCompleted(data?.onboardingCompleted ?? false);
    setTutorialCompleted(data?.tutorialCompleted ?? false);
  }, [data?.onboardingCompleted, data?.tutorialCompleted]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const handlePickPhoto = () => {
    fileInputRef.current?.click();
  };

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.danger('Please choose an image file');
      return;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setUploadingPhoto(true);
    setTimeout(() => {
      setAvatarSrc(url);
      setUploadingPhoto(false);
      toast.success('Photo updated', { timeout: 2000 });
    }, 700);
  };

  const handleResetPhoto = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setAvatarSrc(DEFAULT_AVATAR);
  };

  const isCustomPhoto = avatarSrc !== DEFAULT_AVATAR;

  const isDirty = nickname.trim() !== initialNickname;
  const canSave = !!walletAddress && isDirty && !saving && !!network;

  const fallbackInitials = useMemo(() => {
    const base = nickname.trim() || initialNickname || truncateMiddle(walletAddress) || 'VQ';
    return base.slice(0, 2).toUpperCase();
  }, [nickname, initialNickname, walletAddress]);

  const handleToggleFlag = async (flag: 'onboarding' | 'tutorial', value: boolean) => {
    if (!walletAddress || savingFlag) return;
    const setLocal = flag === 'onboarding' ? setOnboardingCompleted : setTutorialCompleted;
    const prev = flag === 'onboarding' ? onboardingCompleted : tutorialCompleted;
    setLocal(value); // optimistic; reverted on failure
    setSavingFlag(flag);
    try {
      const payload =
        flag === 'onboarding' ? { onboardingCompleted: value } : { tutorialCompleted: value };
      const { success, message } = await saveProfileFlags(payload);
      if (success) {
        toast.success('Preferences updated', { timeout: 2000 });
        refetch();
      } else {
        setLocal(prev);
        toast.danger('Could not update preferences', { description: message, timeout: 4000 });
      }
    } catch (error) {
      setLocal(prev);
      toast.danger('Could not update preferences', {
        description: (error as { message?: string })?.message ?? '',
        timeout: 4000,
      });
    } finally {
      setSavingFlag(null);
    }
  };

  const handleSubmit = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const { success, message } = await saveNickname({ nickname });
      if (success) {
        toast.success('Profile saved', { timeout: 3000 });
        router.push('/profile/settings');
      } else {
        toast.danger('Could not save profile', { description: message, timeout: 4000 });
      }
    } catch (error) {
      toast.danger('Could not save profile', {
        description: (error as { message?: string })?.message ?? '',
        timeout: 4000,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageLayout title="Edit profile" backHref="/profile/settings">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={handlePickPhoto}
              aria-label="Change photo"
              className="relative h-28 w-28 sm:h-32 sm:w-32 rounded-full overflow-hidden border-2 border-black shadow group focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <Avatar size="lg" className="h-full w-full">
                <Avatar.Image src={avatarSrc} className="h-full w-full object-cover" />
                <Avatar.Fallback>{fallbackInitials}</Avatar.Fallback>
              </Avatar>
              <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition">
                Change photo
              </span>
              {uploadingPhoto && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Spinner size="sm" color="current" />
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={handlePickPhoto}
              aria-label="Change photo"
              className="absolute -bottom-1 -right-1 flex h-10 w-10 items-center justify-center rounded-full border border-black border-b-2 bg-primary text-black hover:bg-primary/80 transition shadow"
            >
              <FiCamera className="h-4 w-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoChange}
            />
          </div>
          {isCustomPhoto ? (
            <button
              type="button"
              onClick={handleResetPhoto}
              className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700 hover:text-red-600 transition"
            >
              <FiTrash2 className="h-3 w-3" />
              Remove photo
            </button>
          ) : (
            <p className="text-xs text-gray-500">Tap the photo to change it.</p>
          )}
        </div>

        {/* Form */}
        <section className="flex flex-col gap-4">
          <div>
            <label className="text-black font-medium text-sm block mb-1.5">Nickname</label>
            <input
              type="text"
              placeholder="@nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={32}
              disabled={!walletAddress || isLoading}
              className="w-full bg-white border border-black border-b-2 h-12 px-3 text-black font-medium rounded-md outline-none focus:border-primary disabled:opacity-50"
            />
          </div>

          <div>
            <label className="text-black font-medium text-sm block mb-1.5">Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={profileEmail}
              readOnly
              disabled
              className="w-full bg-gray-50 border border-black border-b-2 h-12 px-3 text-black font-medium rounded-md outline-none opacity-70 cursor-not-allowed"
            />
            <p className="text-xs text-gray-500 mt-1.5">Email editing is coming soon.</p>
          </div>

          {/* Flags */}
          <div className="flex flex-col gap-3">
            <FlagToggle
              label="Onboarding completed"
              description="Mark the initial onboarding flow as done."
              value={onboardingCompleted}
              isDisabled={!walletAddress || isLoading || savingFlag === 'onboarding'}
              isSaving={savingFlag === 'onboarding'}
              onChange={(checked) => handleToggleFlag('onboarding', checked)}
            />
            <FlagToggle
              label="Tutorial completed"
              description="Mark the in-app tutorial as done."
              value={tutorialCompleted}
              isDisabled={!walletAddress || isLoading || savingFlag === 'tutorial'}
              isSaving={savingFlag === 'tutorial'}
              onChange={(checked) => handleToggleFlag('tutorial', checked)}
            />
          </div>
        </section>

        {/* Actions */}
        <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-background border-t border-black/10 flex gap-3">
          <Button type="white" onPress={() => router.push('/profile/settings')} isDisabled={saving} wFull>
            Cancel
          </Button>
          <Button
            type="primary"
            onPress={handleSubmit}
            isDisabled={!canSave}
            isLoading={saving}
            startContent={<FiSave className="h-4 w-4" />}
            wFull
          >
            Save changes
          </Button>
        </div>
    </PageLayout>
  );
}

/**
 * A labelled on/off row. HeroUI v3's `Switch` is a compound component built on
 * react-aria: it renders nothing visible unless `Switch.Control`/`Switch.Thumb`
 * are provided, and it already renders its own <label> (so the row wrapper is a
 * <div> — nesting <label>s breaks the click). The `@heroui/styles` sheet (loaded
 * in globals.css) styles the track/thumb via the auto-applied `switch__*` slot
 * classes, so we pass NO custom classes — overriding them fought the theme's
 * margin-based thumb animation and hid the white knob.
 */
function FlagToggle({
  label,
  description,
  value,
  isDisabled,
  isSaving,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  isDisabled?: boolean;
  isSaving?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-black border-b-2 bg-white px-3 py-3">
      <span>
        <span className="block text-black font-medium text-sm">{label}</span>
        <span className="block text-xs text-gray-500">{description}</span>
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-xs font-semibold ${value ? 'text-green-600' : 'text-gray-400'}`}>
          {isSaving ? 'Saving…' : value ? 'On' : 'Off'}
        </span>
        <Switch isSelected={value} onChange={onChange} isDisabled={isDisabled} aria-label={label}>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch>
      </div>
    </div>
  );
}
