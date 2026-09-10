import { describe, expect, it } from 'vitest';
import { buildInviteUrl, buildShareIntentUrl } from './inviteLink';

const ORIGIN = 'https://app.vaquita.fi';

describe('buildInviteUrl', () => {
  it('carries the code and stamps the channel', () => {
    expect(buildInviteUrl(ORIGIN, 'K7M3QP', 'tiktok')).toBe(
      'https://app.vaquita.fi/?ref=K7M3QP&utm_source=tiktok&utm_medium=referral',
    );
  });

  it('never sets utm_campaign — that field belongs to campaigns', () => {
    // A referral and a campaign share the `?ref=` namespace but not the blob:
    // reusing utm_campaign for a referral code would blur the two.
    expect(buildInviteUrl(ORIGIN, 'K7M3QP', 'whatsapp')).not.toContain('utm_campaign');
  });

  it('marks every channel as referral medium', () => {
    for (const channel of ['whatsapp', 'instagram', 'tiktok', 'telegram', 'copy', 'native'] as const) {
      const url = new URL(buildInviteUrl(ORIGIN, 'ABC234', channel));
      expect(url.searchParams.get('utm_medium')).toBe('referral');
      expect(url.searchParams.get('utm_source')).toBe(channel);
      expect(url.searchParams.get('ref')).toBe('ABC234');
    }
  });
});

describe('buildShareIntentUrl', () => {
  const url = 'https://app.vaquita.fi/?ref=K7M3QP&utm_source=whatsapp&utm_medium=referral';

  it('puts text and link in one WhatsApp message', () => {
    expect(buildShareIntentUrl('whatsapp', url, 'Save with me')).toBe(
      `https://wa.me/?text=${encodeURIComponent(`Save with me ${url}`)}`,
    );
  });

  it('keeps the link in its own Telegram field so the preview renders', () => {
    expect(buildShareIntentUrl('telegram', url, 'Save with me')).toBe(
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent('Save with me')}`,
    );
  });
});
