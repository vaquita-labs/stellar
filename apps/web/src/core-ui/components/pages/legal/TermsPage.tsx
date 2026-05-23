'use client';

import React from 'react';
import { LegalLayout } from './LegalLayout';

export const TERMS_LAST_UPDATED = '2026-05-11';

export function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" lastUpdated={TERMS_LAST_UPDATED}>
      <p>
        Welcome to Vaquita. By creating an account, connecting a wallet, or otherwise using the
        Vaquita app (the &ldquo;Service&rdquo;), you agree to these Terms of Service
        (&ldquo;Terms&rdquo;). Please read them carefully.
      </p>

      <h2>1. The Service</h2>
      <p>
        Vaquita is a gamified savings experience that lets you deposit funds into self-custody
        smart-contract vaults on supported blockchains. Vaquita is non-custodial: you control your
        wallet and your funds at all times.
      </p>

      <h2>2. Eligibility</h2>
      <p>
        You must be at least 18 years old and legally able to enter into a contract in your
        jurisdiction. You are responsible for ensuring that your use of the Service is permitted
        under local law.
      </p>

      <h2>3. Your wallet & funds</h2>
      <ul>
        <li>You are solely responsible for the security of your wallet, keys and recovery phrase.</li>
        <li>Vaquita can never move funds from your wallet on your behalf.</li>
        <li>Blockchain transactions are irreversible. Always double-check before signing.</li>
      </ul>

      <h2>4. Risks</h2>
      <p>
        Cryptocurrencies are volatile and smart-contract protocols carry technical and economic
        risk. Yields, badges, and in-app rewards are not guaranteed and may change at any time. Do
        not deposit more than you can afford to lose.
      </p>

      <h2>5. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service for unlawful activity or to evade sanctions.</li>
        <li>Attempt to disrupt, reverse-engineer or compromise the Service.</li>
        <li>Misrepresent your identity or impersonate others.</li>
      </ul>

      <h2>6. Intellectual property</h2>
      <p>
        The Vaquita name, logo, vaquita mascot and in-app artwork are owned by us. You receive a
        limited, non-transferable license to use the Service for personal, non-commercial purposes.
      </p>

      <h2>7. Disclaimers</h2>
      <p>
        The Service is provided &ldquo;as is&rdquo; without warranties of any kind. To the maximum
        extent permitted by law, we disclaim liability for indirect, incidental or consequential
        damages arising from your use of the Service.
      </p>

      <h2>8. Changes</h2>
      <p>
        We may update these Terms from time to time. We will update the &ldquo;Last
        updated&rdquo; date above. Continued use of the Service after changes means you accept the
        updated Terms.
      </p>

      <h2>9. Contact</h2>
      <p>
        Questions? Reach us at{' '}
        <a href="mailto:hello@vaquita.finance">hello@vaquita.finance</a>.
      </p>
    </LegalLayout>
  );
}
