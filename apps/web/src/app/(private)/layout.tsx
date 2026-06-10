import {
  ClaimGate,
  FollowLinkCapture,
  PendingFollowConsumer,
  RequireAuth,
  TutorialGate,
  UsernameGate,
} from '@/core-ui/components';

export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Outside the gates: stash `?follow=` deep links before the login
          redirect can drop them. Consumed after onboarding (below). */}
      <FollowLinkCapture />
      <RequireAuth>
        <UsernameGate>
          <TutorialGate>
            <ClaimGate>
              <PendingFollowConsumer />
              <main className="flex-1 min-h-0 overflow-auto">{children}</main>
            </ClaimGate>
          </TutorialGate>
        </UsernameGate>
      </RequireAuth>
    </>
  );
}
