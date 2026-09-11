/**
 * Referral link building.
 *
 * One namespace, two kinds of code: `?ref=` carries either a campaign code or a
 * user's referral code, and the backend resolves campaign first, user second.
 * That is why nothing here touches `utm_campaign` — in the admin's
 * `buildCampaignLink` that field is always the campaign code, and reusing it for
 * a referral code would blur two namespaces the rest of the system keeps apart.
 *
 * `utm_medium=referral` is the marker that separates referral traffic from
 * campaign traffic in the stored attribution blob, and `utm_source` is the
 * channel. Both are stamped before the link ever leaves the app, which is the
 * only reason the channel is knowable at all for the two platforms that cannot
 * open a share sheet.
 */

/**
 * Where a link was shared. Becomes `utm_source` verbatim.
 *
 * `qr` is the printed one: the code is scanned off a phone screen at an event,
 * so the only thing that can carry the stamp is the payload itself. Without it
 * every in-person signup would land in the same bucket as a plain copy.
 */
export type ShareChannel = 'whatsapp' | 'instagram' | 'tiktok' | 'telegram' | 'copy' | 'native' | 'qr';

/**
 * How a channel is reached from a browser.
 *
 * `intent` opens a real share URL with the link prefilled. `copy` is the honest
 * fallback: Instagram and TikTok accept no URL-prefilled share from the web at
 * all, so the most we can do is put a channel-stamped link on the clipboard and
 * tell the user to paste it into a bio, caption or DM. The attribution is
 * identical either way — the stamp is baked in before the copy.
 */
export type ShareMode = 'intent' | 'copy';

/**
 * The user's invite link, stamped for one channel.
 *
 * Built from `window.location.origin` because `apps/web` has no app base-URL
 * env var, and because "no extra setup" means the link has to be correct on
 * whatever host the app is being used from.
 */
export const buildInviteUrl = (origin: string, code: string, channel: ShareChannel): string => {
  const params = new URLSearchParams({ ref: code, utm_source: channel, utm_medium: 'referral' });
  return `${origin}/?${params.toString()}`;
};

/** The share-intent URL for the two channels that have one. */
export const buildShareIntentUrl = (channel: 'whatsapp' | 'telegram', url: string, text: string): string => {
  if (channel === 'whatsapp') {
    return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
  }
  return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
};
