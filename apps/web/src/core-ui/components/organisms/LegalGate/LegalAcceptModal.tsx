'use client';

import { Checkbox } from '@vaquita/ui';
import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Button } from '../../atoms';
import { AppModal } from '../../molecules/AppModal';

interface LegalAcceptModalProps {
  /** Bundle version being accepted — recorded verbatim in `legal_acceptances`. */
  policyVersion: string;
  /** Resolves once the acceptance is persisted server-side. Rejects on failure. */
  onAccept: (jurisdictionAttested: boolean) => Promise<void>;
}

// `target="_blank"` throughout: opening a document must not tear down the gate,
// which would drop the user's checkbox state and (worse) unmount the gate that
// is holding the app closed.
const docLink = (href: string) => <a href={href} target="_blank" rel="noopener noreferrer" />;

/**
 * Non-dismissable acceptance prompt. Two separate checkboxes on purpose: the
 * eligibility attestation is a distinct representation from agreeing to the
 * documents, and bundling them into one tick would make it unprovable which
 * one the user actually gave.
 */
export function LegalAcceptModal({ policyVersion, onAccept }: LegalAcceptModalProps) {
  const { t } = useTranslation();

  const [agreedDocs, setAgreedDocs] = useState(false);
  const [attested, setAttested] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Centrado solo en desktop; en celular queda abajo (default de HeroUI).
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const handleConfirm = async () => {
    if (!agreedDocs || !attested || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onAccept(attested);
    } catch {
      // Never fall through to the app on a failed write: an unrecorded
      // acceptance is the exact thing this gate exists to prevent.
      setError(t('auth.legalGate.error'));
      setSaving(false);
    }
  };

  return (
    <AppModal
      open
      onOpenChange={() => {}}
      isDismissable={false}
      hideClose
      title={t('auth.legalGate.title')}
      size="md"
      placement={isDesktop ? 'center' : undefined}
      bodyClassName="flex flex-col gap-4 pb-2"
      footer={
        <Button type="primary" wFull onPress={handleConfirm} isDisabled={!agreedDocs || !attested} isLoading={saving}>
          {saving ? t('auth.legalGate.saving') : t('auth.legalGate.confirm')}
        </Button>
      }
    >
      <p className="text-sm leading-relaxed text-black/60">{t('auth.legalGate.intro')}</p>

      <div className="rounded-2xl bg-black/[0.04] px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
          {t('auth.legalGate.summaryHeading')}
        </p>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4 text-sm leading-relaxed text-black/70">
          <li>{t('auth.legalGate.summaryData')}</li>
          <li>{t('auth.legalGate.summaryOnchain')}</li>
        </ul>
      </div>

      <div className="text-sm text-black/60">
        <span>{t('auth.legalGate.readFull')} </span>
        <span className="[&>a]:font-bold [&>a]:text-primary [&>a]:underline">
          <a href="/privacy" target="_blank" rel="noopener noreferrer">
            {t('auth.legalGate.privacyLink')}
          </a>
          {' · '}
          <a href="/terms" target="_blank" rel="noopener noreferrer">
            {t('auth.legalGate.termsLink')}
          </a>
          {' · '}
          <a href="/risk" target="_blank" rel="noopener noreferrer">
            {t('auth.legalGate.riskLink')}
          </a>
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <Checkbox
          checked={agreedDocs}
          onChange={(e) => setAgreedDocs(e.target.checked)}
          containerClassName="items-start gap-3 leading-relaxed [&>a]:font-bold"
          className="mt-0.5 shrink-0"
          label={
            <span className="[&_a]:font-bold [&_a]:text-primary [&_a]:underline">
              <Trans
                i18nKey="auth.legalGate.acceptPolicies"
                components={{
                  privacy: docLink('/privacy'),
                  terms: docLink('/terms'),
                  risk: docLink('/risk'),
                }}
              />
            </span>
          }
        />
        <Checkbox
          checked={attested}
          onChange={(e) => setAttested(e.target.checked)}
          containerClassName="items-start gap-3 leading-relaxed"
          className="mt-0.5 shrink-0"
          label={<span>{t('auth.legalGate.acceptEligibility')}</span>}
        />
      </div>

      {error && <p className="text-sm font-medium text-red-600">{error}</p>}

      <p className="text-xs text-black/40">{t('auth.legalGate.versionLabel', { version: policyVersion })}</p>
    </AppModal>
  );
}
