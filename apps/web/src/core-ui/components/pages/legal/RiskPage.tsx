'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { LegalLayout } from './LegalLayout';
import { RISK_LAST_UPDATED } from './version';

export { RISK_LAST_UPDATED };

/**
 * Risk Disclosure. Referenced from the Terms as forming part of them, linked
 * from the acceptance gate, and reachable unauthenticated at `/risk` — a legal
 * page behind a login is not a disclosure.
 */
export function RiskPage() {
  const { t } = useTranslation();
  return (
    <LegalLayout title={t('auth.risk.title')} lastUpdated={RISK_LAST_UPDATED}>
      <p>{t('auth.risk.intro')}</p>

      <h2>{t('auth.risk.beta.heading')}</h2>
      <p>{t('auth.risk.beta.body')}</p>

      <h2>{t('auth.risk.smartContract.heading')}</h2>
      <p>{t('auth.risk.smartContract.body')}</p>

      <h2>{t('auth.risk.thirdParty.heading')}</h2>
      <p>{t('auth.risk.thirdParty.body')}</p>

      <h2>{t('auth.risk.noInsurance.heading')}</h2>
      <p>{t('auth.risk.noInsurance.body')}</p>

      <h2>{t('auth.risk.yield.heading')}</h2>
      <p>{t('auth.risk.yield.body')}</p>

      <h2>{t('auth.risk.lock.heading')}</h2>
      <p>{t('auth.risk.lock.body')}</p>

      <h2>{t('auth.risk.stablecoin.heading')}</h2>
      <p>{t('auth.risk.stablecoin.body')}</p>

      <h2>{t('auth.risk.bridge.heading')}</h2>
      <p>{t('auth.risk.bridge.body')}</p>

      <h2>{t('auth.risk.custody.heading')}</h2>
      <p>{t('auth.risk.custody.body')}</p>

      <h2>{t('auth.risk.regulatory.heading')}</h2>
      <p>{t('auth.risk.regulatory.body')}</p>

      <h2>{t('auth.risk.availability.heading')}</h2>
      <p>{t('auth.risk.availability.body')}</p>

      <h2>{t('auth.risk.ack.heading')}</h2>
      <p>{t('auth.risk.ack.body')}</p>
    </LegalLayout>
  );
}
