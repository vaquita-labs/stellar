'use client';

import React from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { LegalLayout } from './LegalLayout';
import { TERMS_LAST_UPDATED } from './version';

export { TERMS_LAST_UPDATED };

const bold = { b: <strong /> };

export function TermsPage() {
  const { t } = useTranslation();
  return (
    <LegalLayout title={t('auth.terms.title')} lastUpdated={TERMS_LAST_UPDATED}>
      <p>{t('auth.terms.intro')}</p>

      <h2>{t('auth.terms.service.heading')}</h2>
      <p>{t('auth.terms.service.body')}</p>

      <h2>{t('auth.terms.beta.heading')}</h2>
      <p>{t('auth.terms.beta.body')}</p>

      <h2>{t('auth.terms.eligibility.heading')}</h2>
      <ul>
        {['age', 'jurisdiction', 'local', 'breach'].map((key) => (
          <li key={key}>{t(`auth.terms.eligibility.${key}`)}</li>
        ))}
      </ul>

      <h2>{t('auth.terms.custody.heading')}</h2>
      <p>{t('auth.terms.custody.intro')}</p>
      <ul>
        <li>
          <Trans i18nKey="auth.terms.custody.self" components={bold} />
        </li>
        <li>
          <Trans i18nKey="auth.terms.custody.managed" components={bold} />
        </li>
      </ul>
      <p>{t('auth.terms.custody.responsibility')}</p>

      <h2>{t('auth.terms.deposits.heading')}</h2>
      <ul>
        {['lock', 'early', 'onTime', 'variable', 'noInsurance', 'rewards'].map((key) => (
          <li key={key}>{t(`auth.terms.deposits.${key}`)}</li>
        ))}
      </ul>

      <h2>{t('auth.terms.noAdvice.heading')}</h2>
      <p>{t('auth.terms.noAdvice.body')}</p>
      <p>{t('auth.terms.noAdvice.notLicensed')}</p>
      <p>{t('auth.terms.noAdvice.software')}</p>

      <h2>{t('auth.terms.risks.heading')}</h2>
      <p>
        <Trans i18nKey="auth.terms.risks.body" components={{ a: <a href="/risk" /> }} />
      </p>

      <h2>{t('auth.terms.acceptableUse.heading')}</h2>
      <p>{t('auth.terms.acceptableUse.intro')}</p>
      <ul>
        {['unlawful', 'disrupt', 'impersonate'].map((key) => (
          <li key={key}>{t(`auth.terms.acceptableUse.${key}`)}</li>
        ))}
      </ul>

      <h2>{t('auth.terms.ip.heading')}</h2>
      <p>{t('auth.terms.ip.body')}</p>

      <h2>{t('auth.terms.disclaimers.heading')}</h2>
      <p>{t('auth.terms.disclaimers.body')}</p>

      <h2>{t('auth.terms.liability.heading')}</h2>
      <p>{t('auth.terms.liability.body')}</p>
      <p>{t('auth.terms.liability.cap')}</p>
      <p>{t('auth.terms.liability.exclusions')}</p>

      <h2>{t('auth.terms.indemnity.heading')}</h2>
      <p>{t('auth.terms.indemnity.body')}</p>

      <h2>{t('auth.terms.termination.heading')}</h2>
      <p>{t('auth.terms.termination.body')}</p>

      <h2>{t('auth.terms.changes.heading')}</h2>
      <p>{t('auth.terms.changes.body')}</p>

      <h2>{t('auth.terms.contact.heading')}</h2>
      <p>
        <Trans
          i18nKey="auth.terms.contact.body"
          components={{ a: <a href="mailto:hello@vaquita.fi" /> }}
        />
      </p>
    </LegalLayout>
  );
}
