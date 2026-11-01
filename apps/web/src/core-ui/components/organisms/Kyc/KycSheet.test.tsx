/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getKycProviders: vi.fn(),
  resolveKyc: vi.fn(),
  getKycStatus: vi.fn(),
  pollKycDecision: vi.fn(),
}));

vi.mock('@pollar/react', () => ({ usePollar: () => ({ getClient: () => h }) }));
vi.mock('@pollar/core', () => ({
  isPollarApiError: (e: unknown) => !!e && typeof e === 'object' && 'code' in e,
}));
vi.mock('@heroui/react', () => ({ Spinner: () => <span>spinner</span> }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
vi.mock('../../molecules/AppModal', () => ({
  AppModal: ({ title, children, footer }: { title: ReactNode; children: ReactNode; footer?: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
      {footer}
    </div>
  ),
}));
vi.mock('../../molecules/PressableButton', () => ({
  PressableButton: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

import { KycSheet } from './KycSheet';

const flush = () => act(async () => {});

describe('KycSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getKycProviders.mockResolvedValue({
      providers: [{ id: 'p1', name: 'Some Provider', flow: 'redirect', levels: ['basic'] }],
    });
  });
  afterEach(cleanup);

  it('starts the named step on open and never shows the provider name', async () => {
    h.resolveKyc.mockResolvedValue({ alreadyApproved: false, sessionId: 's1', kycUrl: 'https://verify.example/x' });
    render(<KycSheet providerId="p1" cardProviderId="cards" onClose={() => {}} onApproved={() => {}} />);
    await flush();
    expect(h.getKycProviders).toHaveBeenCalledWith('MX', undefined, 'cards');
    expect(h.resolveKyc).toHaveBeenCalledWith('p1', 'basic', 'MX', undefined, expect.any(String), 'cards');
    expect(screen.getByText('Verify in a new tab')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Open verification/ }).getAttribute('href')).toBe('https://verify.example/x');
    expect(document.body.textContent).not.toContain('Some Provider');
    expect(document.body.textContent).not.toMatch(/pollar/i);
  });

  it('embeds the provider when it allows it', async () => {
    h.getKycProviders.mockResolvedValue({ providers: [{ id: 'p1', name: 'X', flow: 'iframe', levels: ['basic'] }] });
    h.resolveKyc.mockResolvedValue({ alreadyApproved: false, sessionId: 's1', kycUrl: 'https://verify.example/x' });
    render(<KycSheet providerId="p1" country="BO" corridorId="c1" onClose={() => {}} onApproved={() => {}} />);
    await flush();
    expect(h.resolveKyc).toHaveBeenCalledWith('p1', 'basic', 'BO', 'c1', expect.any(String), undefined);
    expect(document.querySelector('iframe')?.getAttribute('src')).toBe('https://verify.example/x');
  });

  it('shows no footer while verifying and picks up the approval on its own', async () => {
    h.resolveKyc.mockResolvedValue({ alreadyApproved: false, sessionId: 's1', kycUrl: 'https://verify.example/x' });
    h.getKycStatus.mockResolvedValue({ status: 'pending', decisionStatus: 'pending' });
    const onApproved = vi.fn();
    render(<KycSheet providerId="p1" cardProviderId="cards" onClose={() => {}} onApproved={onApproved} />);
    await flush();
    expect(screen.queryByText('I am done')).toBeNull();
    expect(screen.queryByText('Close')).toBeNull();
    // Still in progress: a message from the provider's page reads the status but nothing changes.
    await act(async () => window.dispatchEvent(new MessageEvent('message', { data: 'step' })));
    expect(h.getKycStatus).toHaveBeenCalledWith(undefined, undefined, 'cards');
    expect(onApproved).not.toHaveBeenCalled();
    // The provider finishes: the next look shows the result.
    h.getKycStatus.mockResolvedValue({ status: 'approved' });
    await act(async () => window.dispatchEvent(new MessageEvent('message', { data: 'done' })));
    expect(onApproved).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Identity verified')).toBeTruthy();
  });

  it('checks every few seconds without any message', async () => {
    vi.useFakeTimers();
    try {
      h.resolveKyc.mockResolvedValue({ alreadyApproved: false, sessionId: 's1', kycUrl: 'https://verify.example/x' });
      h.getKycStatus.mockResolvedValue({
        status: 'pending',
        decisionStatus: 'manual_review',
        reviewReason: 'DUPLICATE_DOCUMENT',
      });
      render(<KycSheet providerId="p1" cardProviderId="cards" onClose={() => {}} onApproved={() => {}} />);
      await flush();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(screen.getByText('That document is already in use')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats an already approved start as done', async () => {
    h.resolveKyc.mockRejectedValue({ code: 'SDK_KYC_ALREADY_APPROVED' });
    const onApproved = vi.fn();
    render(<KycSheet providerId="p1" cardProviderId="cards" onClose={() => {}} onApproved={onApproved} />);
    await flush();
    expect(onApproved).toHaveBeenCalledTimes(1);
  });

  it('reads the status when the start says it is under review', async () => {
    h.resolveKyc.mockRejectedValue({ code: 'SDK_KYC_UNDER_REVIEW' });
    h.getKycStatus.mockResolvedValue({ status: 'pending', decisionStatus: 'approved' });
    render(<KycSheet providerId="p1" cardProviderId="cards" onClose={() => {}} onApproved={() => {}} />);
    await flush();
    expect(h.getKycStatus).toHaveBeenCalledWith(undefined, undefined, 'cards');
    expect(screen.getByText('Almost there')).toBeTruthy();
  });

  it('offers a retry when the start fails, with a fresh key after an expired session', async () => {
    h.resolveKyc.mockRejectedValueOnce({ code: 'SDK_KYC_SESSION_EXPIRED' });
    h.resolveKyc.mockResolvedValueOnce({ alreadyApproved: false, sessionId: 's2', kycUrl: 'https://verify.example/y' });
    render(<KycSheet providerId="p1" cardProviderId="cards" onClose={() => {}} onApproved={() => {}} />);
    await flush();
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    const firstKey = h.resolveKyc.mock.calls[0][4];
    await act(async () => screen.getByText('Try again').click());
    expect(h.resolveKyc.mock.calls[1][4]).not.toBe(firstKey);
    expect(screen.getByText('Verify in a new tab')).toBeTruthy();
  });
});
