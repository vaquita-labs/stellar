import { prisma } from '@vaquita/db';

/**
 * Web-push subscriptions (one row per device/browser). The `endpoint` URL is
 * the device's identity at the push service (FCM/APNs), so it is globally
 * unique: re-subscribing upserts by endpoint, and a login switch on the same
 * device re-parents the row to the new wallet instead of duplicating it.
 */

export type PushSubscriptionInput = {
  walletAddress: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string | undefined;
};

const MAX_ENDPOINT = 2000;

export const savePushSubscription = async (input: PushSubscriptionInput) => {
  const endpoint = input.endpoint?.trim() ?? '';
  const p256dh = input.keys?.p256dh?.trim() ?? '';
  const auth = input.keys?.auth?.trim() ?? '';

  if (!endpoint.startsWith('https://') || endpoint.length > MAX_ENDPOINT) {
    throw new Error('A valid push endpoint is required.');
  }
  if (!p256dh || p256dh.length > 200 || !auth || auth.length > 100) {
    throw new Error('Valid subscription keys are required.');
  }

  const profile = await prisma.profile.upsert({
    where: { walletAddress: input.walletAddress },
    update: {},
    create: { walletAddress: input.walletAddress },
  });

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { profileId: profile.id, p256dh, auth, userAgent: input.userAgent?.slice(0, 300) ?? null },
    create: {
      profileId: profile.id,
      endpoint,
      p256dh,
      auth,
      userAgent: input.userAgent?.slice(0, 300) ?? null,
    },
  });

  return { success: true as const };
};

export const deletePushSubscription = async (walletAddress: string, endpoint: string) => {
  // Scoped to the caller's wallet: you can only drop your own device rows.
  await prisma.pushSubscription.deleteMany({
    where: { endpoint: endpoint?.trim() ?? '', profile: { walletAddress } },
  });
  return { success: true as const };
};

/** Whether this wallet has at least one subscribed device (for UI state). */
export const hasPushSubscription = async (walletAddress: string, endpoint?: string) => {
  const count = await prisma.pushSubscription.count({
    where: {
      profile: { walletAddress },
      ...(endpoint ? { endpoint } : {}),
    },
  });
  return { subscribed: count > 0 };
};
