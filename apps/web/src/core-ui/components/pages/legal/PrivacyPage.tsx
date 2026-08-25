'use client';

import React from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { LegalLayout } from './LegalLayout';
import { PRIVACY_LAST_UPDATED } from './version';

export { PRIVACY_LAST_UPDATED };

const mailto = { a: <a href="mailto:privacy@vaquita.fi" /> };
const bold = { b: <strong /> };

export function PrivacyPage() {
  const { t } = useTranslation();
  return (
    <LegalLayout title={t('auth.privacy.title')} lastUpdated={PRIVACY_LAST_UPDATED}>
      <p>{t('auth.privacy.intro')}</p>

      <h2>{t('auth.privacy.scope.heading')}</h2>
      <p>{t('auth.privacy.scope.body')}</p>

      <h2>{t('auth.privacy.collect.heading')}</h2>
      <p>{t('auth.privacy.collect.intro')}</p>
      <ul>
        {['account', 'financial', 'social', 'device', 'diagnostics', 'kyc'].map((key) => (
          <li key={key}>
            <Trans i18nKey={`auth.privacy.collect.${key}`} components={bold} />
          </li>
        ))}
      </ul>

      <h2>{t('auth.privacy.use.heading')}</h2>
      <ul>
        {['operate', 'transactions', 'rewards', 'comms', 'abuse', 'legal'].map((key) => (
          <li key={key}>{t(`auth.privacy.use.${key}`)}</li>
        ))}
      </ul>

      <h2>{t('auth.privacy.share.heading')}</h2>
      <p>{t('auth.privacy.share.intro')}</p>
      <ul>
        {['pollar', 'anclap', 'ably', 'infra', 'observability', 'push', 'qr', 'embeds', 'rpc', 'dune'].map((key) => (
          <li key={key}>
            <Trans i18nKey={`auth.privacy.share.${key}`} components={bold} />
          </li>
        ))}
      </ul>
      <p>{t('auth.privacy.share.legal')}</p>

      <h2>{t('auth.privacy.onchain.heading')}</h2>
      <p>{t('auth.privacy.onchain.body')}</p>

      <h2>{t('auth.privacy.transfers.heading')}</h2>
      <p>{t('auth.privacy.transfers.body')}</p>

      <h2>{t('auth.privacy.storage.heading')}</h2>
      <p>{t('auth.privacy.storage.intro')}</p>
      <ul>
        {['session', 'cache', 'prefs', 'thirdParty'].map((key) => (
          <li key={key}>{t(`auth.privacy.storage.${key}`)}</li>
        ))}
      </ul>

      <h2>{t('auth.privacy.retention.heading')}</h2>
      <p>{t('auth.privacy.retention.body')}</p>

      <h2>{t('auth.privacy.rights.heading')}</h2>
      <p>{t('auth.privacy.rights.intro')}</p>
      <ul>
        {['access', 'correct', 'delete', 'portability', 'object', 'complain'].map((key) => (
          <li key={key}>{t(`auth.privacy.rights.${key}`)}</li>
        ))}
      </ul>
      <p>
        <Trans i18nKey="auth.privacy.rights.exercise" components={mailto} />
      </p>
      <p>{t('auth.privacy.rights.limits')}</p>
      <p>{t('auth.privacy.rights.regional')}</p>

      <h2>{t('auth.privacy.security.heading')}</h2>
      <p>{t('auth.privacy.security.body')}</p>

      <h2>{t('auth.privacy.children.heading')}</h2>
      <p>{t('auth.privacy.children.body')}</p>

      <h2>{t('auth.privacy.changes.heading')}</h2>
      <p>{t('auth.privacy.changes.body')}</p>

      <h2>{t('auth.privacy.contact.heading')}</h2>
      <p>
        <Trans i18nKey="auth.privacy.contact.body" components={mailto} />
      </p>
    </LegalLayout>
  );
}
