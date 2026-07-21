'use client';

import { Switch, toast } from '@heroui/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiChevronRight, FiSave } from 'react-icons/fi';
import { useProfileData, useRestProfile } from '../../../hooks';
import { useConfigStore } from '../../../stores';
import { Button } from '../../atoms';
import { PageLayout } from '../../molecules';
import { VaquitaAvatar } from '../../avatar/VaquitaAvatar';

export function EditProfilePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { walletAddress, network } = useConfigStore();
  const { data, isLoading, refetch } = useProfileData();
  const { saveProfile, saveProfileFlags } = useRestProfile();

  const initialNickname = (data?.nickname ?? '').trim();
  const initialEmail = (data?.email ?? '').trim();

  const [nickname, setNickname] = useState<string>(initialNickname);
  const [email, setEmail] = useState<string>(initialEmail);
  const [nicknameError, setNicknameError] = useState<string>('');
  const [emailError, setEmailError] = useState<string>('');
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [tutorialCompleted, setTutorialCompleted] = useState(false);
  const [savingFlag, setSavingFlag] = useState<null | 'onboarding' | 'tutorial'>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNickname(initialNickname);
  }, [initialNickname]);

  useEffect(() => {
    setEmail(initialEmail);
  }, [initialEmail]);

  useEffect(() => {
    setOnboardingCompleted(data?.onboardingCompleted ?? false);
    setTutorialCompleted(data?.tutorialCompleted ?? false);
  }, [data?.onboardingCompleted, data?.tutorialCompleted]);

  const nicknameDirty = nickname.trim() !== initialNickname;
  const emailDirty = email.trim() !== initialEmail;
  const isDirty = nicknameDirty || emailDirty;
  const canSave = !!walletAddress && isDirty && !saving && !!network;

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
        toast.success(t('profilePages.edit.preferencesUpdated', 'Preferences updated'), { timeout: 2000 });
        refetch();
      } else {
        setLocal(prev);
        toast.danger(t('profilePages.edit.couldNotUpdatePreferences', 'Could not update preferences'), { description: message, timeout: 4000 });
      }
    } catch (error) {
      setLocal(prev);
      toast.danger(t('profilePages.edit.couldNotUpdatePreferences', 'Could not update preferences'), {
        description: (error as { message?: string })?.message ?? '',
        timeout: 4000,
      });
    } finally {
      setSavingFlag(null);
    }
  };

  const handleSubmit = async () => {
    if (!canSave) return;

    // Send only the fields the user actually changed. The API validates and
    // saves each one independently, so e.g. a free nickname still persists even
    // if the email is already taken.
    const payload: { nickname?: string; email?: string } = {};
    if (nicknameDirty) payload.nickname = nickname.trim();
    if (emailDirty) payload.email = email.trim();

    setNicknameError('');
    setEmailError('');
    setSaving(true);
    try {
      const { success, message, result } = await saveProfile(payload);

      if (!success || !result) {
        toast.danger(t('profilePages.edit.couldNotSaveProfile', 'Could not save profile'), { description: message, timeout: 4000 });
        return;
      }

      // Surface per-field errors inline (and clear the ones that succeeded).
      if (payload.nickname !== undefined) setNicknameError(result.nickname.error ?? '');
      if (payload.email !== undefined) setEmailError(result.email.error ?? '');

      const fieldErrors = [result.nickname.error, result.email.error].filter(Boolean) as string[];
      const savedAny = result.nickname.saved || result.email.saved;

      if (savedAny) {
        toast.success(t('profilePages.edit.profileSaved', 'Profile saved'), { timeout: 2500 });
        refetch();
      }
      if (fieldErrors.length > 0) {
        toast.danger(t('profilePages.edit.someChangesNotSaved', 'Some changes were not saved'), {
          description: fieldErrors.join(' '),
          timeout: 5000,
        });
      }
      // Stay on the edit page after saving — the success toast + refetch already
      // reflect the saved values, so the user keeps editing without navigating away.
    } catch (error) {
      toast.danger(t('profilePages.edit.couldNotSaveProfile', 'Could not save profile'), {
        description: (error as { message?: string })?.message ?? '',
        timeout: 4000,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageLayout title={t('profilePages.edit.title', 'Edit profile')} backHref="/profile/settings">
        {/* Avatar — a character, never a photo. Editing it is a whole screen of
            its own, so this is just a preview that links there. */}
        <Link
          href="/profile/avatar"
          className="flex items-center gap-4 rounded-2xl border border-black border-b-2 bg-white p-3 transition hover:-translate-y-0.5"
        >
          <span className="h-20 w-20 shrink-0 overflow-hidden rounded-full border border-black border-b-2 bg-white [&_svg]:h-full [&_svg]:w-full">
            <VaquitaAvatar
              config={data?.avatarConfig}
              seed={data?.walletAddress || walletAddress || ''}
              crop="head"
              background
              alt={t('profilePages.edit.avatarAlt', 'Your avatar')}
              className="block h-full w-full"
            />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-extrabold text-black">
              {t('profilePages.edit.editAvatar', 'Edit avatar')}
            </span>
            <span className="block text-xs text-gray-500">
              {t('profilePages.edit.editAvatarHint', 'Choose your hair, clothes, glasses and more.')}
            </span>
          </span>
          <FiChevronRight className="h-5 w-5 shrink-0 text-gray-400" />
        </Link>

        {/* Form */}
        <section className="flex flex-col gap-4">
          <div>
            <label className="text-black font-medium text-sm block mb-1.5">{t('profilePages.edit.nickname', 'Nickname')}</label>
            <input
              type="text"
              placeholder={t('profilePages.edit.nicknamePlaceholder', '@nickname')}
              value={nickname}
              onChange={(e) => {
                // Usernames double as the public profile URL (/leaderboard/<name>),
                // so only URL-safe lowercase survives typing: a-z, 0-9 and _.
                setNickname(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''));
                if (nicknameError) setNicknameError('');
              }}
              maxLength={32}
              disabled={!walletAddress || isLoading}
              aria-invalid={!!nicknameError}
              className={`w-full bg-white border border-b-2 h-12 px-3 text-black font-medium rounded-md outline-none disabled:opacity-50 ${
                nicknameError ? 'border-red-500 focus:border-red-500' : 'border-black focus:border-primary'
              }`}
            />
            {nicknameError && <p className="text-xs text-red-600 mt-1.5">{nicknameError}</p>}
          </div>

          <div>
            <label className="text-black font-medium text-sm block mb-1.5">{t('profilePages.edit.email', 'Email')}</label>
            <input
              type="email"
              placeholder={t('profilePages.edit.emailPlaceholder', 'you@example.com')}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError('');
              }}
              maxLength={100}
              disabled={!walletAddress || isLoading}
              aria-invalid={!!emailError}
              className={`w-full bg-white border border-b-2 h-12 px-3 text-black font-medium rounded-md outline-none disabled:opacity-50 ${
                emailError ? 'border-red-500 focus:border-red-500' : 'border-black focus:border-primary'
              }`}
            />
            {emailError && <p className="text-xs text-red-600 mt-1.5">{emailError}</p>}
          </div>

          {/* Flags — dev/testing only */}
          <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-black/30 bg-black/[0.02] p-3">
            <div className="flex items-center justify-between gap-2 px-1">
              <span className="text-xs font-extrabold uppercase tracking-wider text-gray-500">
                {t('profilePages.edit.profileFlags', 'Profile flags')}
              </span>
              <span className="rounded-full bg-[#39FF14] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-black shadow-[0_0_8px_rgba(57,255,20,0.7)] ring-1 ring-black/20">
                {t('profilePages.edit.testingOnly', 'Testing only')}
              </span>
            </div>
            <FlagToggle
              label={t('profilePages.edit.onboardingCompleted', 'Onboarding completed')}
              description={t('profilePages.edit.onboardingCompletedDesc', 'Mark the initial onboarding flow as done.')}
              value={onboardingCompleted}
              isDisabled={!walletAddress || isLoading || savingFlag === 'onboarding'}
              isSaving={savingFlag === 'onboarding'}
              onChange={(checked) => handleToggleFlag('onboarding', checked)}
            />
            <FlagToggle
              label={t('profilePages.edit.tutorialCompleted', 'Tutorial completed')}
              description={t('profilePages.edit.tutorialCompletedDesc', 'Mark the in-app tutorial as done.')}
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
            {t('common.cancel')}
          </Button>
          <Button
            type="primary"
            onPress={handleSubmit}
            isDisabled={!canSave}
            isLoading={saving}
            startContent={<FiSave className="h-4 w-4" />}
            wFull
          >
            {t('profilePages.edit.saveChanges', 'Save changes')}
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
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-black border-b-2 bg-white px-3 py-3">
      <span>
        <span className="block text-black font-medium text-sm">{label}</span>
        <span className="block text-xs text-gray-500">{description}</span>
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-xs font-semibold ${value ? 'text-green-600' : 'text-gray-400'}`}>
          {isSaving ? t('common.saving') : value ? t('common.on') : t('common.off')}
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
