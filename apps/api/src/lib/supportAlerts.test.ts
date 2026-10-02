import { describe, expect, it } from 'vitest';
import { buildSupportAlert } from './supportAlerts';

const BASE = {
  kind: 'new' as const,
  conversationId: '6f1c2a9e-0000-4000-8000-000000000001',
  walletAddress: 'GABCQ7M4ZK2XJ5TP3LHR6WNV8YDF2S9UEQKC4BMA7JX3PLT6RZ5NX7Q2',
  nickname: 'maria',
  body: 'My withdrawal is pending',
};

describe('buildSupportAlert', () => {
  it('names the kind of message in the headline', () => {
    expect(buildSupportAlert(BASE)).toContain('New support chat');
    expect(buildSupportAlert({ ...BASE, kind: 'reopened' })).toContain('reopened');
    expect(buildSupportAlert({ ...BASE, kind: 'followup' })).toContain('New support message');
  });

  it('escapes what the user wrote, so it cannot inject markup or break the parse', () => {
    const html = buildSupportAlert({ ...BASE, body: '<a href="x">click</a> & <b>' });
    expect(html).toContain('&lt;a href="x"&gt;click&lt;/a&gt; &amp; &lt;b&gt;');
    expect(html).not.toContain('<a href="x">');
  });

  it('truncates a long message', () => {
    const html = buildSupportAlert({ ...BASE, body: 'x'.repeat(2000) });
    expect(html).toContain(`${'x'.repeat(500)}…`);
    expect(html).not.toContain('x'.repeat(501));
  });

  it('falls back to the wallet when there is no nickname', () => {
    const html = buildSupportAlert({ ...BASE, nickname: null });
    expect(html).not.toContain('@');
    expect(html).toContain('<code>GABC…X7Q2</code>');
  });

  it('links to the thread only when the admin URL is set', () => {
    expect(buildSupportAlert(BASE)).not.toContain('Open in admin');
    expect(buildSupportAlert({ ...BASE, adminUrl: 'https://admin.example.com/' })).toContain(
      `href="https://admin.example.com/support?c=${BASE.conversationId}"`,
    );
  });
});
