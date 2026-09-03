'use client';

import { Switch } from '@heroui/react';
import Link from 'next/link';
import React, { ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FiBell,
  FiChevronRight,
  FiCreditCard,
  FiDownload,
  FiEdit3,
  FiEyeOff,
  FiHelpCircle,
  FiLogOut,
  FiMessageCircle,
  FiShare,
  FiSliders,
  FiUserPlus,
} from 'react-icons/fi';
import { useInstallApp, useLogout, useProfileData } from '../../../hooks';
import { usePrivacyStore, useConfigStore } from '../../../stores';
import { Button } from '../../atoms';
import { AppModal, ConfirmDialog } from '../../molecules';
import { PageHeader } from '../../molecules/PageHeader';
import { useSlidePage } from '../../molecules/useSlidePage';
import { PRIVACY_LAST_UPDATED, TERMS_LAST_UPDATED } from '../legal';

type LinkRow = {
  kind: 'link';
  key: string;
  icon: ReactNode;
  label: string;
  description?: string;
  href?: string;
  /** Destino fuera de la app: se abre en otra pestaña, no por el router. */
  external?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  badge?: string;
};

type SwitchRow = {
  kind: 'switch';
  key: string;
  icon: ReactNode;
  label: string;
  description?: string;
  value: boolean;
  onChange: (next: boolean) => void;
};

type Row = LinkRow | SwitchRow;

function RowShell({
  icon,
  label,
  description,
  badge,
  trailing,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  description?: string;
  badge?: string;
  trailing: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-3 transition ${
        disabled ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Plain glyph, no tinted chip: with a dozen rows stacked, the blue
            squares read as the loudest thing on the screen instead of the
            labels. */}
        <span className="flex h-8 w-8 items-center justify-center text-black shrink-0 [&_svg]:h-[18px] [&_svg]:w-[18px]">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[15px] font-bold text-black truncate">{label}</p>
            {badge && (
              <span className="text-[10px] font-bold uppercase tracking-wide bg-primary text-black border border-black rounded-sm px-1.5 py-0.5">
                {badge}
              </span>
            )}
          </div>
          {description && (
            <p className="text-xs text-gray-600 truncate mt-0.5">{description}</p>
          )}
        </div>
      </div>
      <div className="shrink-0">{trailing}</div>
    </div>
  );
}

function SettingsRow({ row }: { row: Row }) {
  if (row.kind === 'switch') {
    return (
      <label className="block cursor-pointer hover:bg-[#FFF7E6] transition">
        <RowShell
          icon={row.icon}
          label={row.label}
          description={row.description}
          trailing={
            <Switch
              isSelected={row.value}
              onChange={(checked) => row.onChange(checked)}
              aria-label={row.label}
            />
          }
        />
      </label>
    );
  }

  const shell = (
    <RowShell
      icon={row.icon}
      label={row.label}
      description={row.description}
      badge={row.badge}
      disabled={row.disabled}
      trailing={<FiChevronRight className="text-gray-500" />}
    />
  );

  if (row.disabled) {
    return <div aria-disabled="true">{shell}</div>;
  }
  if (row.href) {
    // Un <Link> a un dominio externo se lo come el router: fuera de la app va
    // como <a> a otra pestaña, así Ajustes queda abierto atrás.
    if (row.external) {
      return (
        <a href={row.href} target="_blank" rel="noopener noreferrer" className="block hover:bg-[#FFF7E6] transition">
          {shell}
        </a>
      );
    }
    return (
      <Link href={row.href} className="block hover:bg-[#FFF7E6] transition">
        {shell}
      </Link>
    );
  }
  return (
    <button type="button" onClick={row.onPress} className="block w-full text-left hover:bg-[#FFF7E6] transition">
      {shell}
    </button>
  );
}

function Section({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-extrabold uppercase tracking-wider text-gray-500 px-1">{title}</h2>
      <ul className="rounded-2xl border border-black border-b-2 bg-white overflow-hidden divide-y divide-gray-200">
        {rows.map((row) => (
          <li key={row.key}>
            <SettingsRow row={row} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** FAQ pública del sitio: destino de la fila "Centro de ayuda". */
const HELP_CENTER_URL = 'https://www.vaquita.fi/#faq';

const formatDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

/** Sub-pantallas de Ajustes que <SettingsModal> puede apilar como panel. */
export type SettingsSubKey = 'preferences' | 'profile' | 'notifications' | 'wallet';

/**
 * `onBack` lo pasa <SettingsModal> cuando la pantalla se abre como panel sobre
 * el perfil: ahí el cierre y la animación los maneja el modal. Sin él funciona
 * como ruta suelta (/profile/settings) y se anima sola con useSlidePage.
 *
 * `onOpenSub` (también sólo en modo panel) hace que los ítems de cuenta abran su
 * sub-pantalla como panel apilado en vez de navegar por ruta —que desmontaría
 * todo—. Sin él, los ítems son <Link> normales a sus rutas (deep-link / ruta
 * suelta).
 */
export function SettingsPage({
  onBack,
  onOpenSub,
}: { onBack?: () => void; onOpenSub?: (key: SettingsSubKey) => void } = {}) {
  const { t } = useTranslation();
  const logout = useLogout();
  const { reset } = useConfigStore();
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [showIosInstall, setShowIosInstall] = useState(false);
  const { canInstall, isInstalled, isIOS, promptInstall } = useInstallApp();

  const hideBalance = usePrivacyStore((s) => s.hideBalance);

  // Sólo para el modo ruta suelta: como panel, quien anima es <SettingsModal>.
  const { className: slideClassName, goBack } = useSlidePage('/profile');
  const asPanel = !!onBack;

  const handleDisconnect = async () => {
    if (isDisconnecting) return;
    setIsDisconnecting(true);
    try {
      await logout();
      reset?.(true);
    } catch (error) {
      console.error('Failed to disconnect wallet', error);
    } finally {
      setIsDisconnecting(false);
    }
  };

  // En modo panel (dentro de <SettingsModal>) los ítems abren su sub-pantalla
  // apilada; como ruta suelta son <Link> normales. Uno u otro, nunca ambos.
  const nav = (key: SettingsSubKey, href: string): Pick<LinkRow, 'href' | 'onPress'> =>
    onOpenSub ? { onPress: () => onOpenSub(key) } : { href };

  const accountRows: Row[] = [
    {
      kind: 'link',
      key: 'preferences',
      icon: <FiSliders />,
      label: t('profilePages.settings.preferences', 'Preferences'),
      description: t('profilePages.settings.preferencesDesc', 'Language, currency and display options.'),
      ...nav('preferences', '/profile/preferences'),
    },
    {
      kind: 'link',
      key: 'profile',
      icon: <FiEdit3 />,
      label: t('profilePages.settings.profile', 'Profile'),
      description: t('profilePages.settings.profileDesc', 'Edit your nickname and avatar.'),
      ...nav('profile', '/profile/edit'),
    },
    {
      kind: 'link',
      key: 'notifications',
      icon: <FiBell />,
      label: t('profilePages.settings.notifications', 'Notifications'),
      description: t('profilePages.settings.notificationsDesc', 'Manage push and email alerts.'),
      ...nav('notifications', '/profile/notifications'),
    },
    {
      kind: 'link',
      key: 'wallet',
      icon: <FiCreditCard />,
      label: t('profilePages.settings.wallet', 'Wallet'),
      description: t('profilePages.settings.walletDesc', 'View address, send and receive funds.'),
      ...nav('wallet', '/profile/wallet'),
    },
    {
      kind: 'link',
      key: 'privacy',
      icon: <FiEyeOff />,
      label: t('profilePages.settings.privacy', 'Privacy settings'),
      description: hideBalance
        ? t('profilePages.settings.privacyDescHidden', 'Balance hidden on this device.')
        : t('profilePages.settings.privacyDesc', 'Hide your balance on the profile and home screens.'),
      // Not built yet: the badge says "soon", so the row shouldn't navigate.
      disabled: true,
      badge: t('common.soon'),
    },
  ];

  const supportRows: Row[] = [
    // Hidden when already running as an installed app. On Chromium the native
    // one-click prompt opens; iOS has no install API, so we show instructions.
    ...(!isInstalled && (canInstall || isIOS)
      ? [
          {
            kind: 'link',
            key: 'install',
            icon: <FiDownload />,
            label: t('profilePages.settings.installApp', 'Install app'),
            description: t('profilePages.settings.installAppDesc', 'Add Vaquita to your home screen.'),
            onPress: () => {
              if (canInstall) void promptInstall();
              else setShowIosInstall(true);
            },
          } satisfies LinkRow,
        ]
      : []),
    {
      kind: 'link',
      key: 'help',
      icon: <FiHelpCircle />,
      label: t('profilePages.settings.help', 'Help center'),
      description: t('profilePages.settings.helpDesc', 'FAQ and account support.'),
      href: HELP_CENTER_URL,
      external: true,
    },
    {
      kind: 'link',
      key: 'feedback',
      icon: <FiMessageCircle />,
      label: t('profilePages.settings.feedback', 'Feedback'),
      description: t('profilePages.settings.feedbackDesc', 'Tell us what you think.'),
      disabled: true,
      badge: t('common.soon'),
    },
  ];

  return (
    <>
      <div className={`h-full overflow-y-auto bg-background ${asPanel ? '' : slideClassName}`}>
        <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 pt-4 pb-6 flex flex-col gap-4">
          {/* El mismo <PageHeader> que el resto de la app. Como panel apilado el
              botón cierra el modal (X a la derecha, blanco), no retrocede; como
              página suelta es la flecha atrás a la izquierda. */}
          <PageHeader
            title={t('profilePages.settings.title', 'Settings')}
            onBack={onBack ?? goBack}
            leftIcon={asPanel ? 'close' : 'back'}
          />

          <Section title={t('profilePages.settings.accountSection', 'Account')} rows={accountRows} />
          <Section title={t('profilePages.settings.supportSection', 'Support')} rows={supportRows} />

          {/* Sign out */}
          <div className="pt-1">
            <Button
              type="white"
              startContent={<FiLogOut className="h-4 w-4" />}
              onPress={() => setConfirmLogout(true)}
              isDisabled={isDisconnecting}
              wFull
            >
              {t('profilePages.settings.signOut', 'Sign out')}
            </Button>
          </div>

          {/* Footer: legal links in primary color */}
          <div className="flex flex-col items-start gap-2 pt-3 pb-6">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Link
                href="/terms"
                className="text-xs font-extrabold uppercase tracking-wider text-primary hover:text-primary/80 transition"
              >
                {t('profilePages.settings.terms', 'Terms')}
              </Link>
              <Link
                href="/privacy"
                className="text-xs font-extrabold uppercase tracking-wider text-primary hover:text-primary/80 transition"
              >
                {t('profilePages.settings.privacyPolicy', 'Privacy policy')}
              </Link>
              <Link
                href="/risk"
                className="text-xs font-extrabold uppercase tracking-wider text-primary hover:text-primary/80 transition"
              >
                {t('profilePages.settings.riskDisclosure', 'Risk disclosure')}
              </Link>
            </div>
          </div>
        </div>
      </div>

      <AppModal
        open={showIosInstall}
        onOpenChange={() => setShowIosInstall(false)}
        title={t('profilePages.settings.installIosTitle', 'Install Vaquita')}
        size="sm"
      >
        <div className="flex flex-col gap-4 text-sm text-black">
          <p>{t('profilePages.settings.installIosIntro', 'Add Vaquita to your home screen to open it like an app:')}</p>
          <ol className="flex flex-col gap-3">
            {[
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
            ].map((step, i) => (
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

      <ConfirmDialog
        isOpen={confirmLogout}
        onOpenChange={setConfirmLogout}
        title={t('profilePages.settings.signOutConfirmTitle', 'Sign out?')}
        description={t('profilePages.settings.signOutConfirmDesc', 'Are you sure you want to sign out?')}
        icon={<FiLogOut className="h-5 w-5" />}
        status="danger"
        confirmLabel={t('profilePages.settings.signOut', 'Sign out')}
        onConfirm={handleDisconnect}
        isConfirming={isDisconnecting}
      />
    </>
  );
}
