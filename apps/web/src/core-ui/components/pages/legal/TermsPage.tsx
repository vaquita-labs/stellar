'use client';

import React from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { LegalLayout } from './LegalLayout';

export const TERMS_LAST_UPDATED = '2026-05-11';

export function TermsPage() {
  const { t } = useTranslation();
  return (
    <LegalLayout title={t('auth.terms.title')} lastUpdated={TERMS_LAST_UPDATED}>
      <p>{t('auth.terms.intro')}</p>

      <h2>{t('auth.terms.service.heading')}</h2>
      <p>{t('auth.terms.service.body')}</p>

      <h2>{t('auth.terms.eligibility.heading')}</h2>
      <p>{t('auth.terms.eligibility.body')}</p>

      <h2>{t('auth.terms.wallet.heading')}</h2>
      <ul>
        <li>{t('auth.terms.wallet.security')}</li>
        <li>{t('auth.terms.wallet.noMove')}</li>
        <li>{t('auth.terms.wallet.irreversible')}</li>
      </ul>

      <h2>{t('auth.terms.risks.heading')}</h2>
      <p>{t('auth.terms.risks.body')}</p>

      <h2>{t('auth.terms.acceptableUse.heading')}</h2>
      <p>{t('auth.terms.acceptableUse.intro')}</p>
      <ul>
        <li>{t('auth.terms.acceptableUse.unlawful')}</li>
        <li>{t('auth.terms.acceptableUse.disrupt')}</li>
        <li>{t('auth.terms.acceptableUse.impersonate')}</li>
      </ul>

      <h2>{t('auth.terms.ip.heading')}</h2>
      <p>{t('auth.terms.ip.body')}</p>

      <h2>{t('auth.terms.disclaimers.heading')}</h2>
      <p>{t('auth.terms.disclaimers.body')}</p>

      <h2>{t('auth.terms.changes.heading')}</h2>
      <p>{t('auth.terms.changes.body')}</p>

      <h2>{t('auth.terms.contact.heading')}</h2>
      <p>
        <Trans
          i18nKey="auth.terms.contact.body"
          components={{ a: <a href="mailto:hello@vaquita.finance" /> }}
        />
      </p>
    </LegalLayout>
  );
}
