import { normalizeAvatarConfig, resolveAvatarConfig } from '@vaquita/avatar';
import { Router } from 'express';
import { isNicknameAllowed, isNicknameFormatValid } from '../../lib/nicknamePolicy';
import { requireWalletSession } from '../../lib/walletAuth';
import {
  broadcastProfileChange,
  DEFAULT_NOTIFICATION_PREFERENCES,
  getAchievementCountsByProfile,
  getActiveDepositSumsByWallet,
  getExperienceByProfile,
  getNetworkName,
  getProfile,
  getProfileByNickname,
  getProfileMapObjects,
  getProfiles,
  getProjectConfig,
  getRewardByKey,
  getRewardsData,
  getStreakCountsByProfile,
  MapObjectType,
  prisma,
  purchaseMapItem,
  REWARD_REASON_DAILY_CHECKIN,
  type NotificationPreferenceKey,
  type NotificationPreferences,
  type Profile,
  type ProfileAverageResponseDTO,
  Reward,
  sendError,
  sendSuccess,
  toProfileExperienceResponseDTO,
  toProfileMapObjectsAvailableResponseDTO,
  toProfileMapObjectsResponseDTO,
  toProfileResponseDTO,
  toProfileRewardsResponseDTO,
  toProfileStreakResponseDTO,
} from '@vaquita/shared';

const router = Router();

// Single-network: the network is implicit (one `config` row). Routes are keyed
// by wallet only — the legacy /network/:networkName prefix was removed.

// NOTE: the profile avatar is a character built from the @vaquita/avatar
// catalog, never an uploaded image. There is deliberately no upload endpoint,
// no object storage and no image processing in this service — a profile picture
// can only ever be a set of catalog ids, which removes the whole class of
// user-supplied-binary risks (polyglots, decompression bombs, EXIF, CSAM
// moderation) from the product.

router.get('/wallet/:walletAddress', async (req, res) => {
  const { walletAddress } = req.params;
  req.log.info({ walletAddress }, 'GET /profile/wallet/:walletAddress');

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  return sendSuccess(res, toProfileResponseDTO(await getNetworkName(), profileData));
});

router.get('/wallet/:walletAddress/data', async (req, res) => {
  const { walletAddress } = req.params;
  req.log.info({ walletAddress }, 'GET /profile/.../data');

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  return sendSuccess(res, toProfileResponseDTO(await getNetworkName(), profileData));
});

router.get('/wallet/:walletAddress/experience', async (req, res) => {
  const { walletAddress } = req.params;
  req.log.info({ walletAddress }, 'GET /profile/.../experience');

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  return sendSuccess(res, await toProfileExperienceResponseDTO(await getNetworkName(), profileData));
});

router.get('/wallet/:walletAddress/rewards', async (req, res) => {
  const { walletAddress } = req.params;
  req.log.info({ walletAddress }, 'GET /profile/.../rewards');

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  return sendSuccess(res, await toProfileRewardsResponseDTO(await getNetworkName(), profileData));
});

router.get('/wallet/:walletAddress/streak', async (req, res) => {
  const { walletAddress } = req.params;
  req.log.info({ walletAddress }, 'GET /profile/.../streak');

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  return sendSuccess(res, await toProfileStreakResponseDTO(await getNetworkName(), profileData));
});

router.get('/wallet/:walletAddress/daily-check', async (req, res) => {
  const { walletAddress } = req.params;
  req.log.info({ walletAddress }, 'GET /profile/.../daily-check');

  const { success, errorMessage, errors, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved for daily-check');
    return sendError(res, errorMessage ?? 'Profile not resolved', errors, 404);
  }

  const rewardsResponse = await getRewardsData(profileData);

  if (!rewardsResponse.success) {
    req.log.error({ errors: rewardsResponse.errors, errorMessage: rewardsResponse.errorMessage }, 'Failed to fetch rewards data');
    return sendError(res, rewardsResponse.errorMessage, rewardsResponse.errors, 500);
  }

  return sendSuccess(res, rewardsResponse.rewards);
});

router.get('/wallet/:walletAddress/map-objects', async (req, res) => {
  const { walletAddress } = req.params;
  req.log.info({ walletAddress }, 'GET /profile/.../map-objects');

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  return sendSuccess(res, await toProfileMapObjectsResponseDTO(await getNetworkName(), profileData));
});

router.post('/wallet/:walletAddress/map-objects', requireWalletSession, async (req, res) => {
  const { walletAddress } = req.params;
  const { objects } = req.body ?? {};
  req.log.info({ walletAddress, objectsCount: Array.isArray(objects) ? objects.length : undefined }, 'POST /profile/.../map-objects');

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  const { profileMapObjects } = await getProfileMapObjects(profileData);

  try {
    const result = await prisma.profileMapObject.update({
      where: { id: profileMapObjects.id },
      data: { objects },
    });
    // No devolver la fila cruda de Prisma: su `id` BigInt rompe JSON.stringify
    // (el update quedaba guardado pero la respuesta salía 500).
    return sendSuccess(res, { id: Number(result.id), objects: result.objects });
  } catch (err) {
    req.log.error({ err, profileMapObjectsId: profileMapObjects.id }, 'Failed to update map objects');
    return sendError(res, 'Failed to update map objects', err, 500);
  }
});

router.get('/wallet/:walletAddress/map-objects-available', async (req, res) => {
  const { walletAddress } = req.params;
  req.log.info({ walletAddress }, 'GET /profile/.../map-objects-available');

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  return sendSuccess(res, await toProfileMapObjectsAvailableResponseDTO(await getNetworkName(), profileData));
});

router.post('/wallet/:walletAddress/map-items/purchase', requireWalletSession, async (req, res) => {
  const { walletAddress } = req.params;
  const { type, variant, quantity } = req.body ?? {};
  req.log.info({ walletAddress, type, variant, quantity }, 'POST /profile/.../map-items/purchase');

  if (typeof type !== 'string' || !Object.values(MapObjectType).includes(type as MapObjectType)) {
    return sendError(res, 'Invalid item type', null, 400);
  }
  if (!Number.isInteger(variant) || variant < 0 || variant > 100) {
    return sendError(res, 'Invalid item variant', null, 400);
  }

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);
  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved for purchase');
    return sendError(res, errorMessage ?? 'Profile not resolved', errors, 404);
  }

  try {
    const result = await purchaseMapItem(profileData, type as MapObjectType, variant, quantity ?? 1);
    if (!result.success || !result.purchase) {
      return sendError(res, result.errorMessage, null, result.status);
    }

    try {
      await broadcastProfileChange('map-item-purchased', ['profile-rewards', 'profile-map-objects-available']);
    } catch (err) {
      req.log.error({ err, profileId: profileData.id }, 'Failed to broadcast profile change (map-item-purchased)');
      // La compra ya se registró; el cliente reconcilia en el siguiente fetch.
    }

    return sendSuccess(res, result.purchase);
  } catch (err) {
    req.log.error({ err, walletAddress, type, variant }, 'Failed to purchase map item');
    return sendError(res, 'Failed to purchase item', err, 500);
  }
});

router.post('/wallet/:walletAddress/gold-daily-collect', requireWalletSession, async (req, res) => {
  const { walletAddress } = req.params;
  req.log.info({ walletAddress }, 'POST /profile/.../gold-daily-collect');

  const { success, errorMessage, errors, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved for gold-daily-collect');
    return sendError(res, errorMessage ?? 'Profile not resolved', errors, 404);
  }

  const rewardsResponse = await getRewardsData(profileData);

  if (!rewardsResponse.success) {
    req.log.error({ errors: rewardsResponse.errors, errorMessage: rewardsResponse.errorMessage }, 'Failed to fetch rewards data');
    return sendError(res, rewardsResponse.errorMessage, rewardsResponse.errors, 500);
  }

  const { data: rewardData, error: rewardError } = await getRewardByKey(Reward.GOLD_COIN);

  if (rewardError || !rewardData) {
    req.log.error({ err: rewardError, key: Reward.GOLD_COIN }, 'Reward not found');
    return sendError(res, 'reward not found', rewardError, 404);
  }

  const goldRewardToAmount = rewardsResponse.rewards.find((reward) => reward.key === Reward.GOLD_COIN)?.amountToCollect;

  if (!goldRewardToAmount) {
    req.log.warn({ profileId: profileData.id }, 'No gold coins available to collect');
    return sendError(res, 'there are no gold coins to collect', null, 400);
  }

  // Experience earned alongside the daily coin. The amount is the per-day cap
  // top-up from getRewardsData — max(configured XP - XP already earned today, 0)
  // — so a profile never exceeds the configured daily total. Persisted as an
  // 'earned' row stamped 'daily-checkin' so it can be summed/capped and audited.
  const experienceToCollect =
    rewardsResponse.rewards.find((reward) => reward.key === Reward.EXPERIENCE)?.amountToCollect ?? 0;
  const { data: experienceReward } = await getRewardByKey(Reward.EXPERIENCE);

  let result;
  try {
    // Atomic: the gold coin and its check-in XP are collected together, so a
    // partial failure never grants one without the other.
    const [goldRow] = await prisma.$transaction([
      prisma.profileReward.create({
        data: {
          profileId: profileData.id,
          rewardId: BigInt(rewardData.id),
          amount: goldRewardToAmount,
          reason: REWARD_REASON_DAILY_CHECKIN,
        },
      }),
      ...(experienceReward && experienceToCollect > 0
        ? [
            prisma.profileReward.create({
              data: {
                profileId: profileData.id,
                rewardId: BigInt(experienceReward.id),
                amount: experienceToCollect,
                reason: REWARD_REASON_DAILY_CHECKIN,
              },
            }),
          ]
        : []),
    ]);
    result = goldRow;
  } catch (err) {
    req.log.error({ err, profileId: profileData.id, rewardId: rewardData.id }, 'Failed to insert profile reward');
    return sendError(res, 'Failed to collect gold coin', err, 500);
  }

  try {
    await broadcastProfileChange('gold-daily-collected', [ 'profile-rewards', 'profile-experience' ]);
  } catch (err) {
    req.log.error({ err, profileId: profileData.id }, 'Failed to broadcast profile change (gold-daily-collected)');
    // No retornamos error: el reward ya se guardó. Cliente reconcilia en siguiente fetch.
  }

  req.log.info({ profileId: profileData.id }, 'Gold coin collected');
  return sendSuccess(res, {
    id: Number(result.id),
    reason: result.reason,
    amount: Number(result.amount),
    createdAt: result.createdAt,
  });
});

router.post('/wallet/:walletAddress/nickname', requireWalletSession, async (req, res) => {
  const { walletAddress } = req.params;
  // Nicknames are always stored lowercase so "JUAN", "Juan" and "juan" are the same user.
  const nickname = String(req.body?.nickname ?? '').trim().toLowerCase();
  req.log.info({ walletAddress, nickname }, 'POST /profile/.../nickname');

  if (!isNicknameFormatValid(nickname)) {
    req.log.warn({ walletAddress, nickname }, 'Nickname rejected by format policy');
    return sendError(res, 'Nicknames must be 3-32 lowercase letters, numbers or underscores.', null, 422);
  }

  if (!isNicknameAllowed(nickname)) {
    req.log.warn({ walletAddress, nickname }, 'Nickname rejected by name policy (reserved or moderated)');
    return sendError(res, 'That nickname is not allowed.', null, 422);
  }

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  try {
    // Case-insensitive match so "Juan", "JUAN" and "juan" can't coexist as separate users.
    const existing = await prisma.profile.findFirst({
      where: { nickname: { equals: nickname, mode: 'insensitive' }, id: { not: profileData.id } },
      select: { id: true },
    });

    if (existing) {
      req.log.warn({ nickname }, 'Nickname already in use');
      return sendError(res, 'The nickname is already in use.', null, 409);
    }

    const result = await prisma.profile.update({
      where: { id: profileData.id },
      data: { nickname },
    });

    try {
      await broadcastProfileChange('set-nickname', [ 'profile-data' ]);
    } catch (err) {
      req.log.error({ err, profileId: profileData.id }, 'Failed to broadcast profile change (set-nickname)');
    }

    req.log.info({ profileId: profileData.id, nickname }, 'Nickname updated');
    return sendSuccess(res, result);
  } catch (err) {
    req.log.error({ err, profileId: profileData.id, nickname }, 'Failed to update nickname');
    return sendError(res, 'Failed to update nickname', err, 500);
  }
});

// Update nickname and/or email in one call. Each field is validated and saved
// INDEPENDENTLY: if the email is taken but the nickname is free, the nickname is
// still persisted and only the email reports an error (and vice versa). The
// response carries a per-field `{ saved, error }` so the UI can show a friendly
// message next to whichever field failed.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.patch('/wallet/:walletAddress/profile', requireWalletSession, async (req, res) => {
  const { walletAddress } = req.params;
  const body = req.body ?? {};
  const hasNickname = typeof body.nickname === 'string';
  const hasEmail = typeof body.email === 'string';
  req.log.info({ walletAddress, hasNickname, hasEmail }, 'PATCH /profile/.../profile');

  if (!hasNickname && !hasEmail) {
    return sendError(res, 'Provide a nickname and/or email to update.', null, 400);
  }

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  const result = {
    nickname: { saved: false, error: null as string | null },
    email: { saved: false, error: null as string | null },
  };
  const data: { nickname?: string; email?: string } = {};

  // --- Nickname ---
  if (hasNickname) {
    // Always stored lowercase so "JUAN", "Juan" and "juan" are the same user.
    const nickname = String(body.nickname).trim().toLowerCase();
    if (!nickname) {
      result.nickname.error = 'Please enter a nickname.';
    } else if (!isNicknameFormatValid(nickname)) {
      result.nickname.error = 'Nicknames must be 3-32 lowercase letters, numbers or underscores.';
    } else if (!isNicknameAllowed(nickname)) {
      req.log.warn({ walletAddress, nickname }, 'Nickname rejected by name policy (reserved or moderated)');
      result.nickname.error = 'That nickname is not allowed.';
    } else {
      // Case-insensitive match so "Juan", "JUAN" and "juan" can't coexist as separate users.
      const taken = await prisma.profile.findFirst({
        where: { nickname: { equals: nickname, mode: 'insensitive' }, id: { not: profileData.id }, deletedAt: null },
        select: { id: true },
      });
      if (taken) {
        result.nickname.error = 'That nickname is already taken. Please choose another one.';
      } else {
        data.nickname = nickname;
      }
    }
  }

  // --- Email ---
  if (hasEmail) {
    const email = String(body.email).trim();
    if (!email) {
      result.email.error = 'Please enter an email address.';
    } else if (email.length > 100) {
      result.email.error = 'That email is too long (max 100 characters).';
    } else if (!EMAIL_REGEX.test(email)) {
      result.email.error = 'Please enter a valid email address.';
    } else {
      // Case-insensitive match so Foo@x.com can't shadow foo@x.com on another account.
      const taken = await prisma.profile.findFirst({
        where: {
          email: { equals: email, mode: 'insensitive' },
          id: { not: profileData.id },
          deletedAt: null,
        },
        select: { id: true },
      });
      if (taken) {
        result.email.error = 'That email is already registered to another account.';
      } else {
        data.email = email;
      }
    }
  }

  // Persist only the fields that passed validation.
  if (Object.keys(data).length > 0) {
    try {
      await prisma.profile.update({ where: { id: profileData.id }, data });
      if (data.nickname !== undefined) result.nickname.saved = true;
      if (data.email !== undefined) result.email.saved = true;

      try {
        await broadcastProfileChange('set-profile', ['profile-data']);
      } catch (err) {
        req.log.error({ err, profileId: profileData.id }, 'Failed to broadcast profile change (set-profile)');
      }

      req.log.info({ profileId: profileData.id, ...data }, 'Profile updated');
    } catch (err) {
      req.log.error({ err, profileId: profileData.id, data }, 'Failed to update profile');
      return sendError(res, 'Failed to save profile', err, 500);
    }
  }

  return sendSuccess(res, result);
});

/**
 * Save the user's character avatar.
 *
 * The body is a set of catalog ids + palette indices — never an image.
 * `normalizeAvatarConfig` is the whole validation story: it keeps only keys the
 * catalog knows, replaces unknown part ids with that category's default and
 * clamps colour indices into their palette, so what lands in the DB is always
 * renderable and can never carry attacker-controlled markup.
 */
router.put('/wallet/:walletAddress/avatar', requireWalletSession, async (req, res) => {
  const { walletAddress } = req.params;
  req.log.info({ walletAddress }, 'PUT /profile/.../avatar');

  const body = req.body ?? {};
  if (typeof body !== 'object' || Array.isArray(body)) {
    return sendError(res, 'Invalid avatar configuration.', null, 400);
  }

  const avatarConfig = normalizeAvatarConfig(body);

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  try {
    await prisma.profile.update({
      where: { id: profileData.id },
      data: { avatarConfig },
    });

    try {
      await broadcastProfileChange('set-avatar', ['profile-data']);
    } catch (err) {
      req.log.error({ err, profileId: profileData.id }, 'Failed to broadcast profile change (set-avatar)');
    }

    req.log.info({ profileId: profileData.id }, 'Avatar updated');
    return sendSuccess(res, { avatarConfig });
  } catch (err) {
    req.log.error({ err, profileId: profileData.id }, 'Failed to save avatar');
    return sendError(res, 'Failed to save avatar', err, 500);
  }
});

router.patch('/wallet/:walletAddress/flags', requireWalletSession, async (req, res) => {
  const { walletAddress } = req.params;
  const { onboardingCompleted, tutorialCompleted, cryptoSavvy } = req.body ?? {};
  req.log.info({ walletAddress, onboardingCompleted, tutorialCompleted, cryptoSavvy }, 'PATCH /profile/.../flags');

  // Build a partial update from only the flags actually present in the body, so
  // a toggle can be flipped without touching the others.
  const data: { onboardingCompleted?: boolean; tutorialCompleted?: boolean; cryptoSavvy?: boolean } = {};
  if (typeof onboardingCompleted === 'boolean') data.onboardingCompleted = onboardingCompleted;
  if (typeof tutorialCompleted === 'boolean') data.tutorialCompleted = tutorialCompleted;
  if (typeof cryptoSavvy === 'boolean') data.cryptoSavvy = cryptoSavvy;

  if (Object.keys(data).length === 0) {
    return sendError(res, 'Provide a boolean onboardingCompleted, tutorialCompleted and/or cryptoSavvy.', null, 400);
  }

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  try {
    const result = await prisma.profile.update({
      where: { id: profileData.id },
      data,
    });

    try {
      await broadcastProfileChange('set-flags', [ 'profile-data' ]);
    } catch (err) {
      req.log.error({ err, profileId: profileData.id }, 'Failed to broadcast profile change (set-flags)');
    }

    req.log.info({ profileId: profileData.id, ...data }, 'Profile flags updated');
    return sendSuccess(res, result);
  } catch (err) {
    req.log.error({ err, profileId: profileData.id, data }, 'Failed to update profile flags');
    return sendError(res, 'Failed to update profile flags', err, 500);
  }
});

// Persist the user's display preferences (language / currency). Each value must
// be the `id` of an option offered by the active project config — anything else
// is rejected so we never store a selection the UI can't render.
router.patch('/wallet/:walletAddress/preferences', requireWalletSession, async (req, res) => {
  const { walletAddress } = req.params;
  const { language, currency } = req.body ?? {};
  req.log.info({ walletAddress, language, currency }, 'PATCH /profile/.../preferences');

  if (language !== undefined && typeof language !== 'string') {
    return sendError(res, 'language must be a string option id.', null, 400);
  }
  if (currency !== undefined && typeof currency !== 'string') {
    return sendError(res, 'currency must be a string option id.', null, 400);
  }
  if (language === undefined && currency === undefined) {
    return sendError(res, 'Provide a language and/or currency option id.', null, 400);
  }

  const config = await getProjectConfig();
  if (!config) {
    return sendError(res, 'project config not found', null, 404);
  }

  // Validate each provided id against the configured option lists.
  const data: { language?: string; currency?: string } = {};
  if (language !== undefined) {
    if (!config.languages.some((l) => l.id === language)) {
      return sendError(res, `Unsupported language '${language}'.`, null, 400);
    }
    data.language = language;
  }
  if (currency !== undefined) {
    if (!config.currencies.some((c) => c.id === currency)) {
      return sendError(res, `Unsupported currency '${currency}'.`, null, 400);
    }
    data.currency = currency;
  }

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  try {
    const result = await prisma.profile.update({
      where: { id: profileData.id },
      data,
    });

    try {
      await broadcastProfileChange('set-preferences', [ 'profile-data' ]);
    } catch (err) {
      req.log.error({ err, profileId: profileData.id }, 'Failed to broadcast profile change (set-preferences)');
    }

    req.log.info({ profileId: profileData.id, ...data }, 'Profile preferences updated');
    return sendSuccess(res, result);
  } catch (err) {
    req.log.error({ err, profileId: profileData.id, data }, 'Failed to update profile preferences');
    return sendError(res, 'Failed to update profile preferences', err, 500);
  }
});

// Persist the user's notification toggles ({ push, email, deposits, streaks,
// friends } booleans, all optional). Provided keys are merged over what's
// stored, so each toggle PATCHes independently. Enabling the email channel
// requires an email address on the profile.
router.patch('/wallet/:walletAddress/notification-preferences', requireWalletSession, async (req, res) => {
  const { walletAddress } = req.params;
  const body = (req.body ?? {}) as Partial<NotificationPreferences>;
  req.log.info({ walletAddress, ...body }, 'PATCH /profile/.../notification-preferences');

  const keys = Object.keys(DEFAULT_NOTIFICATION_PREFERENCES) as NotificationPreferenceKey[];
  const updates: Partial<NotificationPreferences> = {};
  for (const key of keys) {
    const value = body[key];
    if (value === undefined) continue;
    if (typeof value !== 'boolean') {
      return sendError(res, `${key} must be a boolean.`, null, 400);
    }
    updates[key] = value;
  }
  if (Object.keys(updates).length === 0) {
    return sendError(res, 'Provide at least one notification toggle to update.', null, 400);
  }

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  if (updates.email === true && !profileData.email) {
    return sendError(res, 'Add an email address to your profile to enable email updates.', null, 400);
  }

  const notificationPreferences = {
    ...(profileData.notification_preferences ?? {}),
    ...updates,
  };

  try {
    const result = await prisma.profile.update({
      where: { id: profileData.id },
      data: { notificationPreferences },
    });

    try {
      await broadcastProfileChange('set-notification-preferences', [ 'profile-data' ]);
    } catch (err) {
      req.log.error({ err, profileId: profileData.id }, 'Failed to broadcast profile change (set-notification-preferences)');
    }

    req.log.info({ profileId: profileData.id, ...updates }, 'Profile notification preferences updated');
    return sendSuccess(res, result);
  } catch (err) {
    req.log.error({ err, profileId: profileData.id, updates }, 'Failed to update profile notification preferences');
    return sendError(res, 'Failed to update profile notification preferences', err, 500);
  }
});

router.get('/nickname-available', async (req, res) => {
  const nickname = String(req.query?.nickname ?? '').trim().toLowerCase();
  req.log.info({ nickname }, 'GET /profile/nickname-available');

  if (!nickname) {
    return sendSuccess(res, { available: false });
  }

  // Distinct reasons so the UI can explain WHY instead of the misleading
  // "already taken": bad charset/length vs moderated name.
  if (!isNicknameFormatValid(nickname)) {
    return sendSuccess(res, { available: false, reason: 'invalid-format' });
  }

  if (!isNicknameAllowed(nickname)) {
    return sendSuccess(res, { available: false, reason: 'not-allowed' });
  }

  try {
    // Case-insensitive match so "Juan", "JUAN" and "juan" are treated as the same user.
    // Soft-deleted profiles don't reserve their nickname (matches the PATCH uniqueness check).
    const existing = await prisma.profile.findFirst({
      where: { nickname: { equals: nickname, mode: 'insensitive' }, deletedAt: null },
      select: { id: true },
    });
    return sendSuccess(res, { available: !existing });
  } catch (err) {
    req.log.error({ err, nickname }, 'Failed to check nickname availability');
    return sendError(res, 'Failed to check nickname availability', err, 500);
  }
});

// Resolves a public username (nickname) to its profile. Backs the
// /leaderboard/<username> page: the client resolves the URL segment to a
// wallet here and then reuses every existing per-wallet query. Lookup is
// case-insensitive (nicknames are stored lowercase, but old links may vary).
router.get('/nickname/:nickname', async (req, res) => {
  const nickname = String(req.params.nickname ?? '').trim().toLowerCase();
  req.log.info({ nickname }, 'GET /profile/nickname/:nickname');

  if (!nickname) {
    return sendError(res, 'Missing nickname', null, 400);
  }

  const { success, errors, errorMessage, profileData } = await getProfileByNickname(nickname);

  if (!success) {
    req.log.error({ errors, errorMessage, nickname }, 'Failed to resolve nickname');
    return sendError(res, errorMessage, errors, 500);
  }

  if (!profileData) {
    return sendError(res, 'Profile not found', null, 404);
  }

  return sendSuccess(res, toProfileResponseDTO(await getNetworkName(), profileData));
});

router.get('/', async (req, res) => {
  req.log.info('GET /profile (list)');

  const { data, error } = await getProfiles();

  if (error) {
    req.log.error({ err: error }, 'Failed to list profiles');
    return sendError(res, 'Failed to list profiles', error, 500);
  }

  const networkName = await getNetworkName();
  return sendSuccess(res, data.map((profile) => toProfileResponseDTO(networkName, profile)), '');
});

// Builds the leaderboard row for a profile. `totalSums`/`lastSum` now hold the
// profile's current active-deposit balance (computed on the fly from `deposits`,
// see getActiveDepositSumsByWallet) instead of the old 30-day snapshot series.
// `count` is 1 so the frontend's `totalSums / count` ranking equals the balance.
const toProfileByDepositsResponseDTO = (
  badgesByProfileId: Map<number, number>,
  depositSumsByWallet: Map<string, number>,
  streaksByProfileId: Map<number, number>,
  experienceByProfileId: Map<number, number>,
) =>
  (profile: Profile): ProfileAverageResponseDTO => {
    const wallet = profile.wallet_address ?? '';
    const sum = depositSumsByWallet.get(wallet) ?? 0;

    return {
      email: profile.email ?? '',
      fullName: profile.full_name ?? '',
      nickname: profile.nickname ?? '',
      avatarConfig: resolveAvatarConfig(profile.avatar_config, wallet),
      walletAddress: wallet,
      totalSums: sum,
      lastSum: sum,
      count: 1,
      timestamp: 0,
      delay: 0,
      badges: badgesByProfileId.get(profile.id) ?? 0,
      streak: streaksByProfileId.get(profile.id) ?? 0,
      experience: experienceByProfileId.get(profile.id) ?? 0,
    };
  };

router.get('/by-average-deposits', async (req, res) => {
  req.log.info('GET /profile/by-average-deposits');
  res.setHeader('Deprecation', 'true');
  res.setHeader('Link', '</api/v1/leaderboard>; rel="successor-version"');

  const { data, error } = await getProfiles();

  if (error) {
    req.log.error({ err: error }, 'Failed to list profiles');
    return sendError(res, 'Failed to list profiles', error, 500);
  }

  // The four rollups are independent of each other (each helper catches its own
  // errors and returns a degraded empty result), so run them concurrently — the
  // endpoint costs the slowest query instead of the sum of all four.
  const [
    { counts: badgesByProfileId, error: badgesError },
    { sums: depositSumsByWallet, error: depositsError },
    { counts: streaksByProfileId, error: streaksError },
    { experience: experienceByProfileId, error: experienceError },
  ] = await Promise.all([
    getAchievementCountsByProfile(),
    getActiveDepositSumsByWallet(),
    getStreakCountsByProfile(),
    getExperienceByProfile(data),
  ]);

  if (badgesError) {
    req.log.error({ err: badgesError }, 'Failed to fetch badge counts (degraded — leaderboard will show 0 badges)');
  }
  if (depositsError) {
    req.log.error({ err: depositsError }, 'Failed to compute active deposit sums (degraded — leaderboard amounts will be 0)');
  }
  if (streaksError) {
    req.log.error({ err: streaksError }, 'Failed to compute streaks (degraded — leaderboard will show 0-day streaks)');
  }
  if (experienceError) {
    req.log.error({ err: experienceError }, 'Failed to compute experience (degraded — leaderboard will show level 1)');
  }

  return sendSuccess(
    res,
    data.map(
      toProfileByDepositsResponseDTO(
        badgesByProfileId,
        depositSumsByWallet,
        streaksByProfileId,
        experienceByProfileId,
      ),
    ),
    '',
  );
});

export default router;
