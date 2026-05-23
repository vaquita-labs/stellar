'use client';

import React from 'react';
import { LegalLayout } from './LegalLayout';

export const PRIVACY_LAST_UPDATED = '2026-05-11';

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated={PRIVACY_LAST_UPDATED}>
      <p>
        Your privacy matters to us. This Privacy Policy explains what information Vaquita collects,
        how we use it, and the choices you have.
      </p>

      <h2>1. Information we collect</h2>
      <ul>
        <li>
          <strong>Wallet address.</strong> When you connect a wallet, we read its public address so
          we can show your balances and activity.
        </li>
        <li>
          <strong>Profile data.</strong> Optional nickname and email if you choose to provide them.
        </li>
        <li>
          <strong>Usage data.</strong> Aggregated, non-identifying analytics about which screens you
          visit, used to improve the app.
        </li>
      </ul>

      <h2>2. How we use information</h2>
      <ul>
        <li>To operate the app, show your savings progress and unlock rewards.</li>
        <li>To send transactional emails or notifications you opted into.</li>
        <li>To detect abuse and keep the Service safe.</li>
      </ul>

      <h2>3. What we do NOT do</h2>
      <ul>
        <li>We do not sell your personal data.</li>
        <li>We do not have custody of your funds or private keys.</li>
        <li>We do not share your wallet address with third-party advertisers.</li>
      </ul>

      <h2>4. Your choices</h2>
      <ul>
        <li>
          Toggle <strong>Hide balance</strong> in Settings → Privacy settings to mask amounts on
          screen.
        </li>
        <li>Disconnect your wallet at any time from the Settings screen.</li>
        <li>Email <a href="mailto:privacy@vaquita.finance">privacy@vaquita.finance</a> to request deletion of profile data.</li>
      </ul>

      <h2>5. Children</h2>
      <p>
        Vaquita is not directed at children under 13 and we do not knowingly collect data from
        them.
      </p>

      <h2>6. Changes</h2>
      <p>
        We will update the &ldquo;Last updated&rdquo; date above whenever this policy changes.
        Material changes will also be announced in the app.
      </p>

      <h2>7. Contact</h2>
      <p>
        Questions? Reach us at <a href="mailto:privacy@vaquita.finance">privacy@vaquita.finance</a>.
      </p>
    </LegalLayout>
  );
}
