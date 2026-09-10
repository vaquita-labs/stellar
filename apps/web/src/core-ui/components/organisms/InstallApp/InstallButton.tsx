'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiDownload } from 'react-icons/fi';
import { useInstallApp } from '../../../hooks';
import { PressableButton } from '../../molecules/PressableButton';
import { IosInstallModal } from './IosInstallModal';

/**
 * The install call to action, for the home header.
 *
 * Installing is not a nicety: on iOS a web app cannot receive a push
 * notification at all until it has been added to the home screen, so every
 * feature that needs to reach a user who is not looking at the app is behind
 * this button. Settings has the same action buried in a list, which nobody
 * finds — this is the visible one.
 *
 * It renders NOTHING in three cases, and each is a different reason:
 *
 * - **Already installed.** Running standalone, or `appinstalled` fired in this
 *   tab. There is nothing left to offer, and an install button inside the
 *   installed app reads as broken.
 * - **No native prompt and not iOS.** A browser that never fired
 *   `beforeinstallprompt` and has no manual route either (Firefox on desktop,
 *   an in-app webview) cannot install, and a button that explains nothing when
 *   pressed is worse than no button.
 * - **Before the browser has decided.** Chromium fires the event a moment after
 *   load, so the button appears then rather than being rendered disabled and
 *   flickering into life.
 *
 * The two platforms take different paths on press: Chromium opens the native
 * prompt, iOS opens the Add-to-Home-Screen instructions, because it has no
 * install API to call.
 */
export function InstallButton({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const { canInstall, isInstalled, isIOS, promptInstall } = useInstallApp();
  const [showIosSteps, setShowIosSteps] = useState(false);
  const [installing, setInstalling] = useState(false);

  if (isInstalled || (!canInstall && !isIOS)) return null;

  const handlePress = async () => {
    if (!canInstall) {
      setShowIosSteps(true);
      return;
    }
    if (installing) return;
    setInstalling(true);
    try {
      await promptInstall();
    } finally {
      setInstalling(false);
    }
  };

  return (
    <>
      <PressableButton
        variant="success"
        size="chip"
        onClick={() => void handlePress()}
        ariaLabel={t('home.stats.installAria', 'Install the app')}
        className={`uppercase tracking-wide ${className}`}
      >
        <FiDownload aria-hidden className="h-3.5 w-3.5" />
        {t('home.stats.install', 'Install')}
      </PressableButton>

      <IosInstallModal open={showIosSteps} onOpenChange={() => setShowIosSteps(false)} />
    </>
  );
}
