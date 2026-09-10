'use client';

import { useTranslation } from 'react-i18next';
import { FiChevronRight, FiDownload, FiShare } from 'react-icons/fi';
import { AppModal } from '../../molecules';

/**
 * The manual Add-to-Home-Screen steps, for iOS.
 *
 * iOS Safari has no install API: `beforeinstallprompt` does not exist there, so
 * there is no prompt to open and nothing a button can do except explain the
 * three taps. Every iOS install in the product goes through this screen, which
 * is why the copy lives in one component instead of once per entry point.
 */
export function IosInstallModal({ open, onOpenChange }: { open: boolean; onOpenChange: () => void }) {
  const { t } = useTranslation();

  const steps = [
    {
      icon: <FiShare />,
      text: t('profilePages.settings.installIosStep1', 'Tap the Share button in your browser.'),
    },
    {
      icon: <FiDownload />,
      text: t('profilePages.settings.installIosStep2', 'Scroll down and tap "Add to Home Screen".'),
    },
    {
      icon: <FiChevronRight />,
      text: t('profilePages.settings.installIosStep3', 'Tap "Add" to confirm.'),
    },
  ];

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('profilePages.settings.installIosTitle', 'Install Vaquita')}
      size="sm"
    >
      <div className="flex flex-col gap-4 text-sm text-black">
        <p>{t('profilePages.settings.installIosIntro', 'Add Vaquita to your home screen to open it like an app:')}</p>
        <ol className="flex flex-col gap-3">
          {steps.map((step, i) => (
            <li key={i} className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#DDF4FF] border border-[#84D8FF] text-black shrink-0">
                {step.icon}
              </span>
              <span>{step.text}</span>
            </li>
          ))}
        </ol>
      </div>
    </AppModal>
  );
}
