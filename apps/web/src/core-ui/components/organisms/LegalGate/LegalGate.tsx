'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsAuthenticated, useProfileData, useRestProfile } from '../../../hooks';
import { useConfigStore } from '../../../stores';
import { ProfileResponseDTO } from '../../../types';
import { LEGAL_POLICY_VERSION } from '../../pages/legal/version';
import { LegalAcceptModal } from './LegalAcceptModal';

/**
 * Hard gate: nothing in the private tree renders until the connected wallet has
 * accepted the current legal bundle. It replaces `children` rather than
 * overlaying them (the `UsernameGate` idiom), because an overlay would leave the
 * app mounted and usable behind the prompt.
 *
 * The comparison is string equality against the server's required version, not
 * ordering — bumping `config.legal_policy_version` re-gates every user, which is
 * the intended behaviour for a material revision.
 */
export function LegalGate({ children }: { children: ReactNode }) {
  const isAuthenticated = useIsAuthenticated();
  const queryClient = useQueryClient();
  const { network } = useConfigStore();
  const { i18n } = useTranslation();
  const { acceptLegal } = useRestProfile();
  const { data, isLoading, isError } = useProfileData();

  // Falls back to the bundled constant so a config fetch failure can never
  // leave the required version empty — every acceptance check would then pass.
  const requiredVersion = network?.legalPolicyVersion || LEGAL_POLICY_VERSION;

  const needsAcceptance =
    isAuthenticated && !isLoading && !isError && !!data && data.legalAcceptedVersion !== requiredVersion;

  const handleAccept = async (jurisdictionAttested: boolean) => {
    const { success, message } = await acceptLegal({
      policyVersion: requiredVersion,
      jurisdictionAttested,
      locale: i18n.language,
    });
    if (!success) throw new Error(message || 'legal acceptance failed');

    // Optimistic patch so the gate drops immediately, mirroring `ClaimGate`;
    // the invalidate below reconciles against what the server actually stored.
    queryClient.setQueryData<ProfileResponseDTO>(
      ['profile', data?.networkName, data?.walletAddress, 'profile-data'],
      (old) => (old ? { ...old, legalAcceptedVersion: requiredVersion } : old),
    );
    queryClient.invalidateQueries({ queryKey: ['profile'] });
  };

  if (needsAcceptance) {
    return <LegalAcceptModal policyVersion={requiredVersion} onAccept={handleAccept} />;
  }

  return <>{children}</>;
}
