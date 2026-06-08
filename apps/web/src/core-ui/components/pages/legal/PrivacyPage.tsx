'use client';

import React from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { LegalLayout } from './LegalLayout';

export const PRIVACY_LAST_UPDATED = '2026-05-11';

export function PrivacyPage() {
  const { t } = useTranslation();
  return (
    <LegalLayout title={t('auth.privacy.title')} lastUpdated={PRIVACY_LAST_UPDATED}>
      <p>{t('auth.privacy.intro')}</p>

      <h2>{t('auth.privacy.collect.heading')}</h2>
      <ul>
        <li>
          <Trans i18nKey="auth.privacy.collect.wallet" components={{ b: <strong /> }} />
        </li>
        <li>
          <Trans i18nKey="auth.privacy.collect.profile" components={{ b: <strong /> }} />
        </li>
        <li>
          <Trans i18nKey="auth.privacy.collect.usage" components={{ b: <strong /> }} />
        </li>
      </ul>

      <h2>{t('auth.privacy.use.heading')}</h2>
      <ul>
        <li>{t('auth.privacy.use.operate')}</li>
        <li>{t('auth.privacy.use.emails')}</li>
        <li>{t('auth.privacy.use.abuse')}</li>
      </ul>

      <h2>{t('auth.privacy.dont.heading')}</h2>
      <ul>
        <li>{t('auth.privacy.dont.sell')}</li>
        <li>{t('auth.privacy.dont.custody')}</li>
        <li>{t('auth.privacy.dont.share')}</li>
      </ul>

      <h2>{t('auth.privacy.choices.heading')}</h2>
      <ul>
        <li>
          <Trans i18nKey="auth.privacy.choices.hideBalance" components={{ b: <strong /> }} />
        </li>
        <li>{t('auth.privacy.choices.disconnect')}</li>
        <li>
          <Trans
            i18nKey="auth.privacy.choices.delete"
            components={{ a: <a href="mailto:privacy@vaquita.finance" /> }}
          />
        </li>
      </ul>

      <h2>{t('auth.privacy.children.heading')}</h2>
      <p>{t('auth.privacy.children.body')}</p>

      <h2>{t('auth.privacy.changes.heading')}</h2>
      <p>{t('auth.privacy.changes.body')}</p>

      <h2>{t('auth.privacy.contact.heading')}</h2>
      <p>
        <Trans
          i18nKey="auth.privacy.contact.body"
          components={{ a: <a href="mailto:privacy@vaquita.finance" /> }}
        />
      </p>
    </LegalLayout>
  );
}
